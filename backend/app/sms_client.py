"""SMS OTP 발송 클라이언트 — 국가별 채널 라우팅 (send_otp 인터페이스 하나).

채널 라우팅 (정규형 E.164 phone 기준):
- `+84` (베트남) → SpeedSMS.vn REST (https://speedsms.vn/sms-api/), 키 = `SMS_PROVIDER_API_KEY`.
- 그 외 국가 → Twilio Messages API (SDK 없이 httpx), 키 = `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`,
  발신 = `TWILIO_MESSAGING_SERVICE_SID`(있으면) 아니면 `TWILIO_FROM_NUMBER`.

fail-safe 3분기 (채널별로 동일하게 적용):
- 해당 채널 키 설정 시 APP_ENV 무관 항상 실발송.
- 키 없음 + dev 환경 → __DEV 스텁: 네트워크 호출 없이 서버 로그로 코드 출력.
- 키 없음 + 운영 → 코드 로그 없이 크게 실패 (라우터에서 502 로 표면화).

SpeedSMS 계약 (공식 문서 확인, 2026-07):
- POST {base}/index.php/sms/send, Basic auth = "{token}:x"
- body: {"to": [전화번호 배열], "content": str, "sms_type": int, "sender": str}
- sms_type=4 = 공용 브랜드네임 "Notify" (sender 불필요; 3/5 만 sender 필수)
- 성공: {"status":"success","code":"00","data":{"tranId",...,"invalidPhone":[...]}}

Twilio 계약:
- POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json, Basic auth = "{SID}:{AuthToken}"
- form: To, Body, MessagingServiceSid 또는 From
- 성공: HTTP 201 + {"sid": ..., "status": "queued", ...} / 오류: HTTP 4xx + {"code", "message"}
"""

import logging
import os

import httpx

log = logging.getLogger(__name__)

SMS_PROVIDER_API_KEY = os.getenv("SMS_PROVIDER_API_KEY", "")
SMS_PROVIDER_BASE_URL = os.getenv("SMS_PROVIDER_BASE_URL", "https://api.speedsms.vn")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
TWILIO_MESSAGING_SERVICE_SID = os.getenv("TWILIO_MESSAGING_SERVICE_SID", "")
_DEV_MODE = os.getenv("APP_ENV", "development").lower() not in ("production", "prod")

_SMS_SEND_PATH = "/index.php/sms/send"
_SMS_TYPE = 4  # 공용 브랜드네임 "Notify" — 자체 브랜드네임(3)/개인 Android 앱(5)과 달리 sender 불필요
_OTP_MESSAGE = "Ma xac thuc Saigon Rider: {code}. Ma het han sau 5 phut. Khong chia se ma nay."

_TWILIO_MESSAGES_URL = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
_TWILIO_OTP_MESSAGE = "Saigon Rider verification code: {code}. Expires in 5 minutes. Do not share this code."


async def send_otp(phone: str, code: str) -> None:
    """OTP 코드를 SMS 로 발송한다. 실패 시 예외를 던진다. (채널 라우팅 + fail-safe 3분기)"""
    if phone.startswith("+84"):
        configured = bool(SMS_PROVIDER_API_KEY)
        send = _send_via_provider
        missing = "SMS_PROVIDER_API_KEY"
    else:
        configured = bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)
        send = _send_via_twilio
        missing = "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN"

    if configured:
        # 키가 설정되면 APP_ENV 와 무관하게 항상 실발송.
        await send(phone, code)
    elif _DEV_MODE:
        # __DEV 스텁 — dev 환경의 유일한 평문 코드 로그.
        # WARNING 레벨: 실발송이 일어나지 않았음을 표시 + 루트 로거 무설정 환경에서도 출력 보장.
        log.warning("[__DEV SMS stub] OTP for %s: %s", phone, code)
    else:
        # 운영 + 키 미설정 — 코드를 절대 로그하지 않고 크게 실패 (라우터에서 502 로 표면화).
        log.error("%s not set in production — OTP send aborted", missing)
        raise RuntimeError("SMS provider not configured in production")


async def _send_via_provider(phone: str, code: str) -> None:
    """SpeedSMS 실발송 (+84). 이 경로에서는 어떤 로그에도 평문 code 를 남기지 않는다."""
    to = phone.lstrip("+")  # 정규형 +84… → SpeedSMS 형식 84… (+ 미포함)
    payload = {
        "to": [to],
        "content": _OTP_MESSAGE.format(code=code),
        "sms_type": _SMS_TYPE,
        "sender": "",
    }
    try:
        async with httpx.AsyncClient(
            base_url=SMS_PROVIDER_BASE_URL,
            auth=(SMS_PROVIDER_API_KEY, "x"),
            timeout=10.0,
        ) as client:
            resp = await client.post(_SMS_SEND_PATH, json=payload)
            resp.raise_for_status()
            body = resp.json()
    except httpx.HTTPError as e:
        log.error("SpeedSMS send failed (transport): %s", e)
        raise
    if body.get("status") != "success":
        log.error("SpeedSMS send rejected: code=%s message=%s", body.get("code"), body.get("message"))
        raise RuntimeError(f"SpeedSMS send failed: code={body.get('code')}")
    if to in (body.get("data") or {}).get("invalidPhone", []):
        log.error("SpeedSMS reported invalid phone: %s", to)
        raise RuntimeError("SpeedSMS rejected phone as invalid")


async def _send_via_twilio(phone: str, code: str) -> None:
    """Twilio 실발송 (비 +84). 이 경로에서는 어떤 로그에도 평문 code·Auth Token 을 남기지 않는다."""
    form = {"To": phone, "Body": _TWILIO_OTP_MESSAGE.format(code=code)}
    if TWILIO_MESSAGING_SERVICE_SID:
        form["MessagingServiceSid"] = TWILIO_MESSAGING_SERVICE_SID
    else:
        form["From"] = TWILIO_FROM_NUMBER
    try:
        async with httpx.AsyncClient(auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN), timeout=10.0) as client:
            resp = await client.post(_TWILIO_MESSAGES_URL.format(sid=TWILIO_ACCOUNT_SID), data=form)
    except httpx.HTTPError as e:
        log.error("Twilio send failed (transport): %s", e)
        raise
    if resp.is_error:
        try:
            err = resp.json()
        except ValueError:
            err = {}
        log.error(
            "Twilio send rejected: status=%s code=%s message=%s",
            resp.status_code,
            err.get("code"),
            err.get("message"),
        )
        raise RuntimeError(f"Twilio send failed: status={resp.status_code} code={err.get('code')}")
