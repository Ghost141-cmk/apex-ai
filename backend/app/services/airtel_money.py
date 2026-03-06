# ============================================================
# AIRTEL MONEY API INTEGRATION
# ============================================================
"""
Airtel Money Africa API v2
Docs: https://developers.airtel.africa/documentation

Flow:
  Deposit:  POST /merchant/v2/payments/   → Airtel sends USSD push to user phone
            Airtel calls our webhook when user confirms
  Withdraw: POST /standard/v3/disbursements/ → Direct transfer to user's Airtel Money wallet

Requires:
  AIRTEL_CLIENT_ID, AIRTEL_CLIENT_SECRET  (from Airtel developer portal)
  AIRTEL_BASE_URL = https://openapi.airtel.africa
"""

import aiohttp, asyncio, logging, json, os
from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4
import hashlib, hmac

logger = logging.getLogger(__name__)

AIRTEL_BASE  = os.getenv("AIRTEL_BASE_URL",     "https://openapi.airtel.africa")
CLIENT_ID    = os.getenv("AIRTEL_CLIENT_ID",    "your_client_id")
CLIENT_SECRET = os.getenv("AIRTEL_CLIENT_SECRET", "your_client_secret")
WEBHOOK_SECRET = os.getenv("AIRTEL_WEBHOOK_SECRET", "your_webhook_secret")
CALLBACK_URL  = os.getenv("AIRTEL_CALLBACK_URL",  "https://yourdomain.com/api/wallet/airtel-webhook")


class AirtelMoneyService:

    def __init__(self):
        self._token: Optional[str] = None
        self._token_expires: Optional[datetime] = None

    # ── OAuth Token ───────────────────────────────────────
    async def _get_token(self) -> str:
        if self._token and self._token_expires and datetime.utcnow() < self._token_expires:
            return self._token

        async with aiohttp.ClientSession() as session:
            resp = await session.post(
                f"{AIRTEL_BASE}/auth/oauth2/token",
                json={
                    "client_id":     CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                    "grant_type":    "client_credentials",
                },
                headers={"Content-Type": "application/json"},
                timeout=aiohttp.ClientTimeout(total=15),
            )
            data = await resp.json()
            if resp.status != 200:
                raise Exception(f"Airtel auth failed: {data}")

            self._token         = data["access_token"]
            self._token_expires = datetime.utcnow() + timedelta(seconds=data.get("expires_in", 3600) - 60)
            return self._token

    async def _headers(self) -> dict:
        token = await self._get_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
            "Accept":        "application/json",
            "X-Country":     "UG",    # Uganda — change per deployment
            "X-Currency":    "UGX",
        }

    # ── Deposit (Collection) ─────────────────────────────
    async def initiate_deposit(
        self,
        phone: str,
        amount: float,
        reference: str,
        user_id: str,
        currency: str = "UGX"
    ) -> dict:
        """
        Triggers USSD push to user phone.
        Returns transaction_id to poll or await webhook.
        """
        tx_id = str(uuid4())
        payload = {
            "reference":   reference,
            "subscriber": {
                "country": "UG",
                "currency": currency,
                "msisdn":   phone.lstrip("+"),
            },
            "transaction": {
                "amount":   str(int(amount)),
                "country":  "UG",
                "currency": currency,
                "id":       tx_id,
            },
        }

        try:
            async with aiohttp.ClientSession() as session:
                resp = await session.post(
                    f"{AIRTEL_BASE}/merchant/v2/payments/",
                    json=payload,
                    headers=await self._headers(),
                    timeout=aiohttp.ClientTimeout(total=30),
                )
                data = await resp.json()
                logger.info(f"Airtel deposit initiated: {tx_id} — {data}")

                if resp.status == 200 and data.get("status", {}).get("code") == "200":
                    return {
                        "success":      True,
                        "tx_id":        tx_id,
                        "airtel_ref":   data.get("data", {}).get("transaction", {}).get("id", tx_id),
                        "message":      "USSD push sent. Ask user to confirm on their phone.",
                        "status":       "pending",
                    }
                else:
                    return {
                        "success": False,
                        "tx_id":   tx_id,
                        "message": data.get("status", {}).get("message", "Unknown error"),
                        "status":  "failed",
                    }
        except Exception as e:
            logger.error(f"Airtel deposit error: {e}")
            return {"success": False, "tx_id": tx_id, "message": str(e), "status": "failed"}

    # ── Withdraw (Disbursement) ───────────────────────────
    async def initiate_withdrawal(
        self,
        phone: str,
        amount: float,
        reference: str,
        currency: str = "UGX"
    ) -> dict:
        tx_id = str(uuid4())
        payload = {
            "payee": {
                "msisdn": phone.lstrip("+"),
            },
            "reference": reference,
            "pin":       os.getenv("AIRTEL_DISBURSEMENT_PIN", "0000"),
            "transaction": {
                "amount":   str(int(amount)),
                "country":  "UG",
                "currency": currency,
                "id":       tx_id,
                "type":     "B2C",
            },
        }

        try:
            async with aiohttp.ClientSession() as session:
                resp = await session.post(
                    f"{AIRTEL_BASE}/standard/v3/disbursements/",
                    json=payload,
                    headers=await self._headers(),
                    timeout=aiohttp.ClientTimeout(total=30),
                )
                data = await resp.json()
                logger.info(f"Airtel withdrawal: {tx_id} — {data}")

                success = resp.status == 200 and data.get("status", {}).get("code") == "200"
                return {
                    "success":    success,
                    "tx_id":      tx_id,
                    "airtel_ref": data.get("data", {}).get("transaction", {}).get("id", tx_id),
                    "message":    data.get("status", {}).get("message", ""),
                    "status":     "completed" if success else "failed",
                }
        except Exception as e:
            logger.error(f"Airtel withdrawal error: {e}")
            return {"success": False, "tx_id": tx_id, "message": str(e), "status": "failed"}

    # ── Transaction Status ────────────────────────────────
    async def check_status(self, airtel_tx_id: str) -> dict:
        try:
            async with aiohttp.ClientSession() as session:
                resp = await session.get(
                    f"{AIRTEL_BASE}/standard/v3/payments/{airtel_tx_id}",
                    headers=await self._headers(),
                    timeout=aiohttp.ClientTimeout(total=15),
                )
                data = await resp.json()
                tx   = data.get("data", {}).get("transaction", {})
                return {
                    "tx_id":   airtel_tx_id,
                    "status":  tx.get("status", "unknown").lower(),
                    "message": tx.get("message", ""),
                }
        except Exception as e:
            return {"tx_id": airtel_tx_id, "status": "error", "message": str(e)}

    # ── Webhook Verification ──────────────────────────────
    def verify_webhook(self, payload_bytes: bytes, signature: str) -> bool:
        """Verify Airtel webhook HMAC-SHA256 signature."""
        expected = hmac.new(
            WEBHOOK_SECRET.encode(),
            payload_bytes,
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    # ── Parse Webhook ─────────────────────────────────────
    def parse_webhook(self, body: dict) -> dict:
        """
        Airtel webhook payload structure (v2):
        {
          "transaction": {
            "id": "...",
            "status": "TS",   // TS=success, TF=failed
            "message": "...",
            "airtel_money_id": "...",
            "msisdn": "...",
          }
        }
        """
        tx = body.get("transaction", {})
        return {
            "airtel_ref": tx.get("id"),
            "status":     "completed" if tx.get("status") == "TS" else "failed",
            "message":    tx.get("message", ""),
            "phone":      tx.get("msisdn", ""),
            "airtel_id":  tx.get("airtel_money_id", ""),
        }


# Singleton
_airtel_service: Optional[AirtelMoneyService] = None

def get_airtel_service() -> AirtelMoneyService:
    global _airtel_service
    if _airtel_service is None:
        _airtel_service = AirtelMoneyService()
    return _airtel_service
