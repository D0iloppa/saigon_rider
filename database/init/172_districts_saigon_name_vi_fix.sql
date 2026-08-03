-- 172: districts.code='SAIGON' 행의 name_vi 성조 결측 교정 ('Saigon' → 'Sài Gòn').
-- 시딩 실수로 이 행만 성조가 빠져 있었다(다른 활성 행은 모두 정상: Bến Thành, Hòa Bình 등).
-- saigon-depth1.json 폴리곤의 동 이름('Sài Gòn')과 name_vi 문자열이 일치해야
-- resolveDistrict()/resolveWardByCoords() 의 폴리곤 우선 매칭(0a72ac5)이 성립한다.
UPDATE districts SET name_vi = 'Sài Gòn' WHERE code = 'SAIGON' AND name_vi <> 'Sài Gòn';
