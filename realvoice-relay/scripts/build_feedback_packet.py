#!/usr/bin/env python3
"""Build a versioned, auditable feedback packet from structured JSON input."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
from typing import Any


ALLOWED_CLAIM_TYPES = {
    "user_experience",
    "user_report",
    "verified_fact",
    "unverified",
    "model_inference",
}
ALLOWED_CONFIDENCE = {"low", "medium", "high"}
ALLOWED_HORIZONS = {"now", "next", "later"}
AUTHENTICITY_STATEMENT = (
    "本反馈基于一位真实用户自愿提供的使用经历，经 RealVoice Relay（真声直达）整理。"
    "事实陈述以用户提供的信息和已注明的第一方资料为依据；未经验证的内容、模型推断"
    "与改进建议均已明确区分，不作为平台既有事实的断言。"
)

REDACTION_RULES = (
    (re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)"), "[手机号已脱敏]"),
    (
        re.compile(
            r"(?<![0-9A-Za-z])\d{6}(?:18|19|20)\d{2}"
            r"(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9Xx](?![0-9A-Za-z])"
        ),
        "[身份信息已脱敏]",
    ),
    (
        re.compile(
            r"(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@"
            r"[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![A-Za-z0-9.-])"
        ),
        "[邮箱已脱敏]",
    ),
    (
        re.compile(r"(?<!\d)(?:\d[ -]?){15,19}(?!\d)"),
        "[支付信息已脱敏]",
    ),
)


def _require_text(data: dict[str, Any], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} must be a non-empty string")
    return value.strip()


def redact_text(value: str) -> str:
    redacted = value
    for pattern, replacement in REDACTION_RULES:
        redacted = pattern.sub(replacement, redacted)
    return redacted


def _normalize_claims(claims: Any) -> list[dict[str, Any]]:
    if not isinstance(claims, list):
        raise ValueError("claims must be a list")
    normalized = []
    for index, claim in enumerate(claims):
        if not isinstance(claim, dict):
            raise ValueError(f"claims[{index}] must be an object")
        claim_type = claim.get("type")
        if claim_type not in ALLOWED_CLAIM_TYPES:
            raise ValueError(f"claims[{index}].type is not allowed")
        text = _require_text(claim, "text")
        evidence = claim.get("evidence", [])
        if not isinstance(evidence, list) or not all(
            isinstance(item, str) for item in evidence
        ):
            raise ValueError(f"claims[{index}].evidence must be a string list")
        normalized.append(
            {
                "type": claim_type,
                "text": redact_text(text),
                "evidence": [redact_text(item.strip()) for item in evidence if item.strip()],
            }
        )
    return normalized


def _integer_in_range(value: Any, name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} must be an integer")
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


def _normalize_sentiment(sentiment: Any) -> dict[str, Any]:
    if not isinstance(sentiment, dict):
        raise ValueError("sentiment must be an object")
    confidence = sentiment.get("confidence", "low")
    if confidence not in ALLOWED_CONFIDENCE:
        raise ValueError("sentiment.confidence must be low, medium, or high")
    return {
        "intensity": _integer_in_range(
            sentiment.get("intensity", 1), "sentiment.intensity", 1, 5
        ),
        "satisfaction": _integer_in_range(
            sentiment.get("satisfaction", 5), "sentiment.satisfaction", 0, 10
        ),
        "satisfaction_kind": "model_estimate",
        "confidence": confidence,
        "basis": redact_text(str(sentiment.get("basis", "")).strip()),
    }


def _normalize_recommendations(items: Any) -> list[dict[str, str]]:
    if not isinstance(items, list):
        raise ValueError("recommendations must be a list")
    normalized = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError(f"recommendations[{index}] must be an object")
        horizon = item.get("horizon")
        if horizon not in ALLOWED_HORIZONS:
            raise ValueError(f"recommendations[{index}].horizon is not allowed")
        normalized.append(
            {
                "horizon": horizon,
                "action": redact_text(_require_text(item, "action")),
                "user_value": redact_text(str(item.get("user_value", "")).strip()),
                "platform_value": redact_text(
                    str(item.get("platform_value", "")).strip()
                ),
                "acceptance": redact_text(_require_text(item, "acceptance")),
            }
        )
    return normalized


def build_feedback_packet(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("input must be a JSON object")
    platform = _require_text(data, "platform")
    raw_feedback = _require_text(data, "raw_feedback")
    evidence = data.get("evidence", [])
    if not isinstance(evidence, list) or not all(isinstance(item, str) for item in evidence):
        raise ValueError("evidence must be a string list")

    return {
        "schema_version": "1.0",
        "target": {
            "platform": redact_text(platform),
            "product_area": redact_text(str(data.get("product_area", "")).strip()),
        },
        "context": {
            "scenario": redact_text(str(data.get("scenario", "")).strip()),
            "occurred_at": redact_text(str(data.get("occurred_at", "")).strip()),
            "frequency": redact_text(str(data.get("frequency", "")).strip()),
            "impact": redact_text(str(data.get("impact", "")).strip()),
            "desired_outcome": redact_text(
                str(data.get("desired_outcome", "")).strip()
            ),
        },
        "claims": _normalize_claims(data.get("claims", [])),
        "sentiment": _normalize_sentiment(data.get("sentiment", {})),
        "recommendations": _normalize_recommendations(
            data.get("recommendations", [])
        ),
        "evidence_ids": [redact_text(item.strip()) for item in evidence if item.strip()],
        "authentic_voice_excerpt": redact_text(raw_feedback)[:500],
        "authenticity_statement": AUTHENTICITY_STATEMENT,
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Normalize a structured RealVoice Relay feedback packet."
    )
    parser.add_argument("input", type=Path, help="UTF-8 JSON input file")
    parser.add_argument(
        "--output", type=Path, help="Output file; stdout when omitted"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        data = json.loads(args.input.read_text(encoding="utf-8"))
        packet = build_feedback_packet(data)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    rendered = json.dumps(packet, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
