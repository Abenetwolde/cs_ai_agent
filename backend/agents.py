import json
import os
import re
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import ChatSession, Order, SupportTicket, User

load_dotenv(Path(__file__).with_name('.env'), override=True)
LANGUAGE_NAMES = {'en': 'English', 'am': 'Amharic', 'om': 'Afaan Oromo', 'ti': 'Tigrinya'}


def gemini_client():
    key = os.getenv('GEMINI_API_KEY')
    if not key:
        return None
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(model=os.getenv('GEMINI_MODEL', 'gemini-3.5-flash-lite'), google_api_key=key)


def _content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return '\n'.join(str(item.get('text', '')) if isinstance(item, dict) else str(item) for item in content)
    return str(content or '')


def rewrite_search_query(message: str, history: list[dict]) -> str:
    client = gemini_client()
    if client is None:
        return message
    history_text = '\n'.join(f"{item['role']}: {item['content']}" for item in history[-4:])
    try:
        response = client.invoke([
            SystemMessage(content='Rewrite the latest customer support message as a short standalone search query for company FAQs and policies. Return only the query. Do not answer.'),
            HumanMessage(content=f'Conversation context:\n{history_text}\n\nLatest message:\n{message}'),
        ])
        rewritten = _content_text(response.content).strip()
        return rewritten[:600] if rewritten else message
    except Exception:
        return message


class LookupArgs(BaseModel):
    order_number: str = Field(description='The exact order number stated by the customer')


class TicketArgs(BaseModel):
    issue_summary: str = Field(description='Concise support issue summary')
    priority: str = Field(default='normal', description='One of low, normal, high, urgent')


class ProfileArgs(BaseModel):
    field: str = Field(description='One of full_name, email, phone, preferred_language')
    value: str = Field(description='The new value the customer explicitly requested')


class EscalationArgs(BaseModel):
    reason_summary: str = Field(description='Concise reason this should be handed to a human')


def make_tools(db: Session, user: User, chat_session: ChatSession) -> list[StructuredTool]:
    results: list[dict] = []

    def lookup_user_orders(order_number: str) -> dict:
        record = db.scalar(select(Order).where(Order.order_number == order_number.strip().upper(), Order.user_id == user.id))
        result = {'found': False, 'order_number': order_number.strip().upper()}
        if record:
            result = {'found': True, 'order_number': record.order_number, 'status': record.status,
                      'estimated_delivery': record.estimated_delivery.isoformat() if record.estimated_delivery else None,
                      'carrier': record.carrier, 'items': record.items}
        results.append({'tool': 'lookup_user_orders', 'result': result})
        return result

    def create_support_ticket(issue_summary: str, priority: str = 'normal') -> dict:
        allowed = {'low', 'normal', 'high', 'urgent'}
        normalized = priority.lower().strip()
        if normalized not in allowed:
            normalized = 'normal'
        ticket = SupportTicket(ticket_number=f"SUP-{uuid.uuid4().hex[:8].upper()}", user_id=user.id,
                               session_id=chat_session.id, issue_summary=issue_summary[:1200], priority=normalized)
        db.add(ticket)
        db.flush()
        result = {'ticket_id': ticket.ticket_number, 'priority': ticket.priority, 'status': ticket.status}
        results.append({'tool': 'create_support_ticket', 'result': result})
        return result

    def update_user_profile(field: str, value: str) -> dict:
        allowed = {'full_name', 'email', 'phone', 'preferred_language'}
        if field not in allowed:
            return {'updated': False, 'reason': 'That profile field cannot be changed.'}
        if field == 'preferred_language' and value not in LANGUAGE_NAMES:
            return {'updated': False, 'reason': 'Unsupported language.'}
        if field == 'email' and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            return {'updated': False, 'reason': 'Invalid email address.'}
        if field == 'phone' and not re.fullmatch(r'\+?[0-9 ()-]{7,24}', value):
            return {'updated': False, 'reason': 'Invalid phone number.'}
        setattr(user, field, value[:254])
        db.flush()
        result = {'updated': True, 'field': field, 'value': value}
        results.append({'tool': 'update_user_profile', 'result': result})
        return result

    def escalate_to_human(reason_summary: str) -> dict:
        summary = reason_summary[:1200]
        chat_session.status = 'escalated'
        chat_session.escalation_summary = summary
        ticket = SupportTicket(ticket_number=f"SUP-{uuid.uuid4().hex[:8].upper()}", user_id=user.id,
                               session_id=chat_session.id, issue_summary=summary, priority='high')
        db.add(ticket)
        db.flush()
        result = {'escalated': True, 'ticket_id': ticket.ticket_number, 'summary': summary}
        results.append({'tool': 'escalate_to_human', 'result': result})
        return result

    return [
        StructuredTool.from_function(lookup_user_orders, name='lookup_user_orders', description='Look up a customer order by exact order number. Only returns orders belonging to the signed-in user.', args_schema=LookupArgs),
        StructuredTool.from_function(create_support_ticket, name='create_support_ticket', description='Create a support ticket for an issue the customer wants staff to resolve.', args_schema=TicketArgs),
        StructuredTool.from_function(update_user_profile, name='update_user_profile', description='Update a user profile field only when the customer clearly asks to change it.', args_schema=ProfileArgs),
        StructuredTool.from_function(escalate_to_human, name='escalate_to_human', description='Escalate a serious, unresolved, or explicitly human-requested issue and create a staff ticket.', args_schema=EscalationArgs),
    ]


def orchestrate_tools(db: Session, user: User, chat_session: ChatSession, message: str, history: list[dict], context: str) -> tuple[list[dict], str | None]:
    client = gemini_client()
    tools = make_tools(db, user, chat_session)
    collected: list[dict] = []
    escalation_summary = None
    if client is not None:
        try:
            tool_map = {tool.name: tool for tool in tools}
            conversation: list[Any] = [
                SystemMessage(content=("You are a customer-support action orchestrator. Decide whether an allowed database tool is needed. "
                    "Never invent data or execute profile changes unless explicitly requested. Escalate explicit human requests, suspected fraud, "
                    "legal threats, serious safety concerns, or an unresolved complaint. Use exact order numbers only. "
                    "Ground any policy decision in this context:\n" + (context or 'No policy context found.')))
            ]
            for item in history[-8:]:
                conversation.append(HumanMessage(content=item['content']) if item['role'] == 'user' else AIMessage(content=item['content']))
            conversation.append(HumanMessage(content=message))
            bound = client.bind_tools(tools)
            for _ in range(4):
                response = bound.invoke(conversation)
                calls = getattr(response, 'tool_calls', []) or []
                if not calls:
                    break
                conversation.append(response)
                for call in calls:
                    name = call.get('name')
                    tool = tool_map.get(name)
                    if tool is None:
                        continue
                    result = tool.invoke(call.get('args') or {})
                    item = {'tool': name, 'result': result}
                    if not collected or collected[-1] != item:
                        collected.append(item)
                    if name == 'escalate_to_human' and isinstance(result, dict):
                        escalation_summary = result.get('summary')
                    conversation.append(ToolMessage(content=json.dumps(result, ensure_ascii=False, default=str), tool_call_id=call['id']))
            return collected, escalation_summary
        except Exception:
            # If Gemini is unavailable, continue with deterministic, scoped tools below.
            pass

    order = re.search(r'\bADDIS-\d{4,}\b', message, re.I)
    if order and any(term in message.lower() for term in ('order', 'track', 'status', 'delivery', 'where')):
        result = tools[0].invoke({'order_number': order.group(0)})
        collected.append({'tool': 'lookup_user_orders', 'result': result})
    lowered = message.lower()
    if any(term in lowered for term in ('human', 'real person', 'representative', 'agent', 'fraud', 'stolen', 'lawyer', 'lawsuit')) or any(term in message for term in ('ሰው ጋር', 'ሰው አነጋግር')):
        summary = f"Customer requested help with: {message[:600]}"
        result = tools[3].invoke({'reason_summary': summary})
        collected.append({'tool': 'escalate_to_human', 'result': result})
        escalation_summary = summary
    return collected, escalation_summary


def gemini_fallback_answer(message: str, language: str, context: str, tool_results: list[dict]) -> str | None:
    client = gemini_client()
    if client is None:
        return None
    prompt = (f"Answer in {LANGUAGE_NAMES.get(language, 'English')}. Be concise and empathetic. "
              "Only answer policy questions from the supplied context. If absent, say the information is unavailable. "
              "Use tool results as the only source for account/order data. Do not claim a handoff unless tool results show it.\n\n"
              f"Company context:\n{context or 'No matching approved company information.'}\n\n"
              f"Structured tool results:\n{json.dumps(tool_results, ensure_ascii=False, default=str)}\n\nCustomer message:\n{message}")
    try:
        response = client.invoke([HumanMessage(content=prompt)])
        return _content_text(response.content).strip() or None
    except Exception:
        return None
