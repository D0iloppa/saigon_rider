"""입금 식별코드 회귀 (260907_ad_payment_pipeline_design.md §3-5, §8 P1-2 검증 항목 2).

- 문자셋에 I/L/O/U 가 없는지
- 체크문자가 1자 오타·인접 자리 전위 오류를 전수 검사로 100% 검출하는지
- 정규화(O→0, I→1, L→1)가 맞는지
- 적요 추출이 0/1/2건 케이스를 올바르게 가르는지
"""

import unittest

from app.services.ad_payments.payment_code import (
    ALPHABET,
    BODY_LEN,
    PREFIX,
    extract_codes,
    generate_payment_code,
    normalize,
    parse_and_validate,
)


class AlphabetTests(unittest.TestCase):
    def test_alphabet_excludes_confusable_letters(self):
        for excluded in "ILOU":
            self.assertNotIn(excluded, ALPHABET)
        self.assertEqual(len(ALPHABET), 32)
        self.assertEqual(len(set(ALPHABET)), 32)


class GenerateTests(unittest.TestCase):
    def test_generated_code_is_well_formed_and_self_valid(self):
        code = generate_payment_code()
        self.assertRegex(code, rf"^{PREFIX}-[{ALPHABET}]{{{BODY_LEN + 1}}}$")
        self.assertEqual(parse_and_validate(code), code)


class CheckCharacterExhaustiveTests(unittest.TestCase):
    """체크문자가 오타·전위를 100% 검출하는지 — (자리, 값쌍) 전수 6x32x32 (F-4).

    체크섬 delta 는 (자리, 이전값, 새값)에만 의존하고 나머지 본문 자리와는 무관하다(payment_code.py
    상단 mod-37 증명) — 따라서 대상 자리 이외를 고정값('0')으로 두고 대상 자리만 전수 순회해도
    "체크 공식 자체"의 검출력이 전수 검증된다. 이전 구현은 generate_payment_code() 로 뽑은 표본
    64개를 썼는데, 그 표본은 체크섬<32 로만 채택되어(§checksum 재시도 로직) 본문값 분포가 편향돼
    있었다(전체 32**6 공간의 86.49%만 대표) — "전수"라는 이름이 과장이었다.
    """

    def test_single_character_typo_always_detected(self):
        for pos in range(BODY_LEN):
            for original in ALPHABET:
                body = "0" * pos + original + "0" * (BODY_LEN - pos - 1)
                check = _check(body)
                if check is None:
                    continue  # 체크섬>=32 — 알파벳으로 표현 불가한 본문(생성 시에도 제외됨)
                self.assertIsNotNone(parse_and_validate(f"{PREFIX}-{body}{check}"))
                for replacement in ALPHABET:
                    if replacement == original:
                        continue
                    typo = body[:pos] + replacement + body[pos + 1 :]
                    self.assertIsNone(
                        parse_and_validate(f"{PREFIX}-{typo}{check}"),
                        f"오타 미검출: {body} -> {typo}",
                    )

    def test_adjacent_transposition_always_detected(self):
        for pos in range(BODY_LEN - 1):
            for v1 in ALPHABET:
                for v2 in ALPHABET:
                    if v1 == v2:
                        continue
                    body = "0" * pos + v1 + v2 + "0" * (BODY_LEN - pos - 2)
                    check = _check(body)
                    if check is None:
                        continue  # 체크섬>=32 — 알파벳으로 표현 불가한 본문
                    swapped = body[:pos] + v2 + v1 + body[pos + 2 :]
                    self.assertIsNone(
                        parse_and_validate(f"{PREFIX}-{swapped}{check}"),
                        f"전위 미검출: {body} -> {swapped}",
                    )

    def test_boundary_transposition_body_last_char_and_check_detected(self):
        """경계 전위: 본문 마지막 자리 ↔ 체크문자. 체크문자는 본문 전위 공식과 별개 위치라
        본문 내부 전위와 다른 경로로 검증해야 한다."""
        for original in ALPHABET:
            body = "0" * (BODY_LEN - 1) + original
            check = _check(body)
            if check is None:
                continue  # 체크섬>=32 — 알파벳으로 표현 불가한 본문
            if check == original:
                continue  # no-op 전위
            swapped_body = body[:-1] + check
            self.assertIsNone(
                parse_and_validate(f"{PREFIX}-{swapped_body}{original}"),
                f"경계 전위 미검출: body={body} check={check}",
            )

    def test_check_character_typo_always_detected(self):
        """체크문자 자체가 오타난 경우(본문은 그대로) — 6x32x31 전수."""
        for pos in range(BODY_LEN):
            for original in ALPHABET:
                body = "0" * pos + original + "0" * (BODY_LEN - pos - 1)
                check = _check(body)
                if check is None:
                    continue  # 체크섬>=32 — 알파벳으로 표현 불가한 본문
                for wrong_check in ALPHABET:
                    if wrong_check == check:
                        continue
                    self.assertIsNone(parse_and_validate(f"{PREFIX}-{body}{wrong_check}"))


def _check(body: str) -> str | None:
    """`body` 의 체크문자. 체크섬이 32 이상이면 알파벳으로 표현 불가 — None(생성 시에도 재시도 대상)."""
    from app.services.ad_payments.payment_code import ALPHABET as _A
    from app.services.ad_payments.payment_code import _checksum

    checksum = _checksum(body)
    return _A[checksum] if checksum < len(_A) else None


class NormalizeTests(unittest.TestCase):
    def test_normalize_maps_confusable_letters_to_digits(self):
        self.assertEqual(normalize("sgr-o1lI0"), "SGR01110")

    def test_normalize_strips_non_alnum(self):
        self.assertEqual(normalize(" S g r - 1 2 3 "), "SGR123")


class ExtractCodesTests(unittest.TestCase):
    def test_zero_codes_when_memo_has_no_code(self):
        self.assertEqual(extract_codes("chuyen tien thang 9"), [])
        self.assertEqual(extract_codes(None), [])

    def test_one_code_extracted_from_memo(self):
        code = generate_payment_code()
        body_and_check = code.split("-")[1]
        memo = f"CK thang 9 {PREFIX} {body_and_check} cam on"
        self.assertEqual(extract_codes(memo), [code])

    def test_two_distinct_codes_yield_two_results(self):
        code_a = generate_payment_code()
        code_b = generate_payment_code()
        memo = f"{code_a} va {code_b}"
        found = extract_codes(memo)
        self.assertEqual(set(found), {code_a, code_b})
        self.assertEqual(len(found), 2)

    def test_garbled_code_still_extracted_via_normalization(self):
        code = generate_payment_code()
        body, check = code.split("-")[1][:-1], code.split("-")[1][-1]
        garbled_body = body.replace("0", "O", 1) if "0" in body else body
        memo = f"sgr {garbled_body}{check}".lower()
        found = extract_codes(memo)
        self.assertEqual(found, [code])

    def test_extract_recovers_hyphen_inside_code_body(self):
        # SGR-RSJ-TDYN 류 — 코드 내부에 삽입된 하이픈 (F-1)
        code = generate_payment_code()
        body_and_check = code.split("-")[1]
        mid = len(body_and_check) // 2
        memo = f"CK thang 9 {PREFIX}-{body_and_check[:mid]}-{body_and_check[mid:]} cam on"
        self.assertEqual(extract_codes(memo), [code])

    def test_extract_recovers_space_inside_code_body(self):
        # SGR-RSJ TDYN 류 — 코드 내부에 삽입된 공백 (F-1)
        code = generate_payment_code()
        body_and_check = code.split("-")[1]
        mid = len(body_and_check) // 2
        memo = f"CK thang 9 {PREFIX}-{body_and_check[:mid]} {body_and_check[mid:]} cam on"
        self.assertEqual(extract_codes(memo), [code])

    def test_extract_recovers_dot_inside_code_body(self):
        # SGR-RSJ.TDYN 류 — 코드 내부에 삽입된 점 (F-1)
        code = generate_payment_code()
        body_and_check = code.split("-")[1]
        mid = len(body_and_check) // 2
        memo = f"CK thang 9 {PREFIX}-{body_and_check[:mid]}.{body_and_check[mid:]} cam on"
        self.assertEqual(extract_codes(memo), [code])

    def test_extract_recovers_double_separator_after_prefix(self):
        # SGR- RSJTDYN 류 — 접두어 뒤 구분자 2개(하이픈+공백) (F-1)
        code = generate_payment_code()
        body_and_check = code.split("-")[1]
        memo = f"CK thang 9 {PREFIX}-  {body_and_check} cam on"
        self.assertEqual(extract_codes(memo), [code])

    def test_extract_recovers_code_wrapped_in_brackets(self):
        # [SGR](RSJTDYN) 류 — 괄호 삽입 (F-1)
        code = generate_payment_code()
        body_and_check = code.split("-")[1]
        memo = f"[{PREFIX}]({body_and_check}) cam on"
        self.assertEqual(extract_codes(memo), [code])

    def test_two_codes_concatenated_without_separator_both_extracted(self):
        # 정규화가 구분자를 없애므로, 적요에 코드 2개가 구분자 없이 연달아 붙어도(SGR..SGR..)
        # 각 코드가 정확히 PREFIX+BODY_LEN+1 길이라 경계에서 어긋나지 않고 둘 다 추출된다.
        code_a = generate_payment_code()
        code_b = generate_payment_code()
        memo = f"{PREFIX}{code_a.split('-')[1]}{PREFIX}{code_b.split('-')[1]}"
        self.assertEqual(extract_codes(memo), [code_a, code_b])


if __name__ == "__main__":
    unittest.main()
