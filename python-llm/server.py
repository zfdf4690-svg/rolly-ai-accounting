"""
Rolly AI 记账 — Python LLM 网关
供妙搭本地 Node 插件（@official-plugins/ai-*）以 HTTP 调用，
提示词（prompt）与 jsonStructure 由 Node 侧 capability 配置原样透传，本服务只负责：
  1) 接入 OpenAI 兼容大模型（配置见项目根 .env）
  2) 文本/图片 → 结构化 JSON
  3) 文本流式生成（SSE）

启动：python server.py   （默认 127.0.0.1:8000）
"""
from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from llm_client import (
    DEFAULT_MODEL,
    LLMError,
    append_json_structure,
    chat_complete,
    normalize_images,
    normalize_structure,
    parse_loose_json,
    stream_chat,
)

app = FastAPI(title="Rolly Python LLM Gateway", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------- 请求模型 ----------------


class TextToJsonRequest(BaseModel):
    prompt: str = ""
    json_structure: Any = Field(default=None, alias="jsonStructure")
    model_params: dict | None = Field(default=None, alias="modelParams")
    model_id: str | None = Field(default=None, alias="modelID")

    model_config = {"populate_by_name": True}


class ImageToJsonRequest(TextToJsonRequest):
    images: Any = None  # list[str] / JSON 字符串 / 单个 URL


class GenerateRequest(BaseModel):
    prompt: str = ""
    model_params: dict | None = Field(default=None, alias="modelParams")
    model_id: str | None = Field(default=None, alias="modelID")

    model_config = {"populate_by_name": True}


def _merged_model_params(req: TextToJsonRequest | GenerateRequest) -> dict | None:
    mp = dict(req.model_params or {})
    if req.model_id:
        mp["modelID"] = req.model_id
    return mp or None


# ---------------- 路由 ----------------


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "model": DEFAULT_MODEL}


@app.post("/llm/text-to-json")
async def text_to_json(req: TextToJsonRequest) -> JSONResponse:
    try:
        full_prompt = append_json_structure(req.prompt, req.json_structure)
        raw = await chat_complete(full_prompt, model_params=_merged_model_params(req))
        parsed = parse_loose_json(raw)
        data = normalize_structure(parsed, req.json_structure)
        return JSONResponse({"data": data})
    except LLMError as e:
        return JSONResponse(status_code=502, content={"error": str(e)})
    except Exception as e:  # noqa: BLE001 - 网关层统一兜底
        return JSONResponse(status_code=500, content={"error": f"解析失败: {e}"})


@app.post("/llm/image-to-json")
async def image_to_json(req: ImageToJsonRequest) -> JSONResponse:
    try:
        images = normalize_images(req.images)
        if not images:
            return JSONResponse(status_code=400, content={"error": "未提供待识别的小票图片"})
        full_prompt = append_json_structure(req.prompt, req.json_structure)
        raw = await chat_complete(
            full_prompt, images=images, model_params=_merged_model_params(req)
        )
        parsed = parse_loose_json(raw)
        data = normalize_structure(parsed, req.json_structure)
        return JSONResponse({"data": data})
    except LLMError as e:
        return JSONResponse(status_code=502, content={"error": str(e)})
    except Exception as e:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": f"识别失败: {e}"})


@app.post("/llm/generate/stream")
async def generate_stream(req: GenerateRequest) -> StreamingResponse:
    async def event_gen():
        try:
            async for piece in stream_chat(
                req.prompt, model_params=_merged_model_params(req)
            ):
                yield f"data: {json.dumps({'content': piece}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except LLMError as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="127.0.0.1",
        port=int(__import__("os").getenv("PYTHON_LLM_PORT", "8000")),
        log_level="info",
    )
