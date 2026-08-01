# Nginx 413 Request Entity Too Large — 아바타 업로드 실패 (2026-05-15)

## 증상

프로필 아바타 이미지 업로드 시 HTTP 413 에러 발생.  
Toast에 "HTTP 413" 메시지 출력, 업로드 불가.

## 원인

`nginx/conf.d/default.conf` 에 `client_max_body_size` 설정이 없었음.  
Nginx 기본값은 **1MB**로, 이를 초과하는 파일 업로드 요청을 413으로 거부.

업로드 경로: `POST /api/bff/profile/avatar` → nginx 리버스 프록시 → BFF

```
Client → nginx(리버스 프록시) → bff:8080 → imgproxy
                ↑ 여기서 413 반환
```

## 조치

`nginx/conf.d/default.conf` server 블록에 `client_max_body_size 0` 추가:

```nginx
server {
    listen 80;
    ...
    # 업로드 용량 제한 없음 (기본값 1MB → 아바타 등 파일 업로드 413 방지)
    client_max_body_size 0;
    ...
}
```

`0` = 제한 없음. 내부 서비스이므로 무제한으로 설정.

nginx는 conf.d 볼륨 마운트이므로 **재빌드 불필요**, reload로 즉시 적용:

```bash
docker exec saigon_nginx nginx -t      # 문법 검사
docker exec saigon_nginx nginx -s reload
```

## 참고

- BFF나 imgproxy 측에도 자체 업로드 크기 제한이 있을 수 있음 (현재는 nginx가 병목)
- 보안상 필요 시 `client_max_body_size 20m` 등으로 상한 지정 가능
