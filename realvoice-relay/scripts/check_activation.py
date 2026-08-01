#!/usr/bin/env python3
"""Check a RealVoice Relay activation receipt without handling wallet secrets."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
from typing import Any, NamedTuple
from urllib import error, request


class ActivationResult(NamedTuple):
    active: bool
    reason: str
    details: dict[str, Any]


def _verify_remote(
    endpoint: str,
    agent_id: str,
    receipt: str,
    timeout: float = 10.0,
) -> ActivationResult:
    url = endpoint.rstrip("/") + "/verify"
    body = json.dumps(
        {"agent_id": agent_id, "receipt": receipt},
        separators=(",", ":"),
    ).encode("utf-8")
    http_request = request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with request.urlopen(http_request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = {}
        return ActivationResult(
            False,
            str(payload.get("reason", f"verification_http_{exc.code}")),
            payload if isinstance(payload, dict) else {},
        )

    if not isinstance(payload, dict):
        return ActivationResult(False, "verification_response_invalid", {})
    active = payload.get("active") is True
    reason = str(payload.get("reason", "active" if active else "inactive"))
    return ActivationResult(active, reason, payload)


def check_activation(
    *,
    agent_id: str,
    receipt: str | None,
    endpoint: str | None,
) -> ActivationResult:
    if not isinstance(agent_id, str) or len(agent_id.strip()) < 3:
        return ActivationResult(False, "agent_id_invalid", {})
    normalized_receipt = receipt.strip() if isinstance(receipt, str) else ""
    if not normalized_receipt:
        return ActivationResult(False, "receipt_missing", {})
    if not endpoint:
        return ActivationResult(
            False,
            "verification_endpoint_missing",
            {"receipt_present": True},
        )
    try:
        return _verify_remote(endpoint, agent_id.strip(), normalized_receipt)
    except (OSError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        return ActivationResult(
            False,
            "verification_unreachable",
            {"error_type": type(exc).__name__},
        )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Verify a RealVoice Relay permanent activation receipt."
    )
    parser.add_argument(
        "--agent-id",
        default=os.environ.get("REALVOICE_AGENT_ID"),
        required=os.environ.get("REALVOICE_AGENT_ID") is None,
    )
    parser.add_argument(
        "--receipt-file",
        type=Path,
        help="Receipt file; otherwise use REALVOICE_ACTIVATION_RECEIPT.",
    )
    parser.add_argument(
        "--endpoint",
        default=os.environ.get("REALVOICE_ACTIVATION_URL"),
        help="Activation gateway base URL.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        receipt = (
            args.receipt_file.read_text(encoding="utf-8")
            if args.receipt_file
            else os.environ.get("REALVOICE_ACTIVATION_RECEIPT")
        )
    except OSError as exc:
        print(
            json.dumps(
                {"active": False, "reason": "receipt_read_failed", "error": str(exc)}
            )
        )
        return 2

    result = check_activation(
        agent_id=args.agent_id,
        receipt=receipt,
        endpoint=args.endpoint,
    )
    print(
        json.dumps(
            {
                "active": result.active,
                "reason": result.reason,
                "details": result.details,
            },
            ensure_ascii=False,
        )
    )
    return 0 if result.active else 1


if __name__ == "__main__":
    raise SystemExit(main())

