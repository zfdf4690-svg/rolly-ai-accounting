"""
LLM 客户端：封装 OpenAI 兼容的 chat/completions 调用。
- 支持普通文本、多模态（图片）、SSE 流式
- 适配 GLM 推理模型：推理阶段 content 可能为空（只有 reasoning_content）
配置来自项目根目录 .env：LLM_BASE_URL / LLM_API_KEY / LLM_MODEL（可选）
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, AsyncIterator

import httpx
from dotenv import load_dotenv

# 读取项目根目录 .env（python-llm/ 的上一级）
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_PROJECT_ROOT / ".env")

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.scnet.cn/api/llm/v1").rstrip("/")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
DEFAULT_MODEL = os.getenv("LLM_MODEL", "GLM-5.3-Flash-Event")

# 网络与生成默认值
HTTP_TIMEOUT = float(os.getenv("LLM_HTTP_TIMEOUT", "120"))
DEFAULT_MAX_TOKENS = 8192
DEFAULT_TEMPERATURE = 0.5


class LLMError(RuntimeError):
    """LLM 调用错误（上游非 200、配置缺失、响应异常等）。"""


def _headers() -> dict[str, str]:
    if not LLM_API_KEY:
        raise LLMError("LLM_API_KEY 未配置，请在项目根目录 .env 中设置 LLM_API_KEY")
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LLM_API_KEY}",
    }


def _build_messages(prompt: str, images: list[str] | None) -> list[dict]:
    if images:
        content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        content.extend({"type": "image_url", "image_url": {"url": u}} for u in images)
        return [{"role": "user", "content": content}]
    return [{"role": "user", "content": prompt}]


def _model_settings(model_params: dict | None) -> tuple[str, int, float]:
    mp = model_params or {}
    model = mp.get("modelID") or DEFAULT_MODEL
    max_tokens = int(mp.get("maxTokens") or DEFAULT_MAX_TOKENS)
    temperature = float(mp.get("temperature", DEFAULT_TEMPERATURE))
    return model, max_tokens, temperature


async def chat_complete(
    prompt: str,
    *,
    images: list[str] | None = None,
    model_params: dict | None = None,
) -> str:
    """非流式调用，返回模型文本内容。content 为空时回退从 reasoning_content 提取。"""
    model, max_tokens, temperature = _model_settings(model_params)
    payload = {
        "model": model,
        "messages": _build_messages(prompt, images),
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        resp = await client.post(
            f"{LLM_BASE_URL}/chat/completions", headers=_headers(), json=payload
        )
    if resp.status_code != 200:
        raise LLMError(f"LLM 接口返回 {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    message = (data.get("choices") or [{}])[0].get("message") or {}
    content = message.get("content") or ""
    if not content and message.get("reasoning_content"):
        # 推理模型：最终答案落在推理内容里时，尝试从中提取 JSON
        content = message["reasoning_content"]
    if not content:
        raise LLMError("LLM 未返回有效内容")
    return content


async def stream_chat(
    prompt: str,
    *,
    model_params: dict | None = None,
) -> AsyncIterator[str]:
    """流式调用，逐片段 yield 正文 content（自动过滤 reasoning_content）。"""
    model, max_tokens, temperature = _model_settings(model_params)
    payload = {
        "model": model,
        "messages": _build_messages(prompt, None),
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        async with client.stream(
            "POST", f"{LLM_BASE_URL}/chat/completions", headers=_headers(), json=payload
        ) as resp:
            if resp.status_code != 200:
                body = (await resp.aread()).decode("utf-8", "ignore")
                raise LLMError(f"LLM 接口返回 {resp.status_code}: {body[:300]}")
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                chunk = line[5:].strip()
                if chunk == "[DONE]":
                    return
                try:
                    obj = json.loads(chunk)
                except json.JSONDecodeError:
                    continue
                delta = (obj.get("choices") or [{}])[0].get("delta") or {}
                text = delta.get("content")
                if isinstance(text, str) and text:
                    yield text


# ---------------- JSON 提取与归一化 ----------------

_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```")


def strip_code_fence(text: str) -> str:
    m = _FENCE_RE.search(text)
    return m.group(1).strip() if m else text.strip()


def parse_loose_json(text: str) -> Any:
    """容忍代码块围栏与前后多余文字的 JSON 解析。"""
    cleaned = strip_code_fence(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start_obj, end_obj = cleaned.find("{"), cleaned.rfind("}")
        if start_obj != -1 and end_obj > start_obj:
            return json.loads(cleaned[start_obj : end_obj + 1])
        start_arr, end_arr = cleaned.find("["), cleaned.rfind("]")
        if start_arr != -1 and end_arr > start_arr:
            return json.loads(cleaned[start_arr : end_arr + 1])
        raise LLMError("LLM 输出不是合法 JSON")


def normalize_structure(parsed: Any, json_structure: Any) -> dict:
    """
    把 LLM 的输出归一化为「对象」，与前端 parseResult.transactions 等取值对齐：
    1) [{"name": "transactions", "value": [...]}] → {"transactions": [...]}
    2) 纯数据数组 + jsonStructure 顶层字段名 → {字段名: 数组}
    3) dict 原样返回
    4) 其他标量包一层 {"result": value}
    """
    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, list):
        if parsed and all(
            isinstance(x, dict) and "name" in x and "value" in x for x in parsed
        ):
            return {x["name"]: x["value"] for x in parsed}
        if isinstance(json_structure, list) and json_structure:
            top = json_structure[0]
            if isinstance(top, dict) and top.get("name"):
                return {top["name"]: parsed}
        return {"result": parsed}
    return {"result": parsed}


def append_json_structure(prompt: str, json_structure: Any) -> str:
    if not json_structure:
        return prompt
    return (
        prompt
        + "\n\n请严格按照以下 JSON 结构输出结果（字段名与结构必须一致）：\n"
        + json.dumps(json_structure, ensure_ascii=False, indent=2)
        + "\n\n只输出合法的 JSON 对象本身，不要包含任何解释、Markdown 代码块标记或其他文字。"
    )


def normalize_images(images: Any) -> list[str]:
    """兼容数组、JSON 字符串、单个 URL 三种形态。"""
    if isinstance(images, list):
        return [u for u in images if isinstance(u, str) and u.strip()]
    if isinstance(images, str) and images.strip():
        raw = images.strip()
        if raw.startswith("["):
            try:
                arr = json.loads(raw)
                if isinstance(arr, list):
                    return [u for u in arr if isinstance(u, str) and u.strip()]
            except json.JSONDecodeError:
                pass
        return [raw]
    return []
