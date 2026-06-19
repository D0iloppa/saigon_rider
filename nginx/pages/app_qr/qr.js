/**
 * QR Code Verification Logic
 */

//const API_HOST = 'https://doil.chickenkiller.com/lsh_api/api'
const API_HOST ='https://letantonsheriff.com/lsh_api/api'


// 1. URL에서 토큰 추출
function getToken() {
    const params = new URLSearchParams(window.location.search);
    return params.get('coupon_token');
}

// 2. [API 연동] 예약 데이터 가져오기
function fetchReservationData(token) {
    // 요청하신 API URL
    const API_URL = API_HOST + '/coupon/qrCheck';

    console.log("Fetching data for token:", token);


    // fetch 함수는 Promise를 반환하므로 그대로 return 해도 됩니다.
    return fetch(`${API_URL}?token=${token}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            // 필요 시 인증 헤더 추가
            // 'Authorization': 'Bearer ...' 
        }
    })
    .then(response => {
        // 1. 네트워크 응답 상태 확인
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        // 2. JSON 파싱
        return response.json();
    })
    .then(responseBody => {
        // 3. 실제 데이터 추출 ("response는 data 안에 있을거야" 반영)
        // 백엔드에서 Map<String, Object> result를 반환하고, 그 안에 'data' 키로 감싸져 있다고 가정
        // 만약 result 자체가 데이터라면 `return responseBody;` 로 수정하세요.
        const data = responseBody.data || responseBody; 

        // 데이터 유효성 검사 (옵션)
        if (!data) {
            throw new Error("No data received from server");
        }
        
        // 유효하지 않은 토큰 처리 (백엔드 응답 규격에 따라 조정 필요)
        // 예: data.status가 없거나 에러 메시지가 온 경우
        if (data.coupon_status === 'invalid' || data.error) {
            throw new Error(data.message || "Invalid Token");
        }

        return data;
    })
    .catch(error => {
        console.error("Fetch Error:", error);
        throw error; // 에러를 UI 렌더링 함수로 전달
    });
}



// 3. UI 렌더링 함수
function renderView(data) {
    const app = document.getElementById('app');
    
    // 상태별 스타일 및 텍스트 설정
    let statusClass = 'valid';
    let statusText = 'Available';
    let btnDisabled = false;
    let btnText = 'SỬ DỤNG COUPON'; // 버튼 텍스트
    let couponTxt = `${data.discount_value} % Coupon`


    if (data.coupon_status === 'RESERVED') {
        statusClass = 'valid';
        statusText = 'Hợp lệ'; // Available
    } else if (data.coupon_status === 'USED') {
        statusClass = 'used';
        statusText = 'Đã sử dụng'; // Used -> Already used
        btnDisabled = true;
        btnText = 'Hoàn tất'; // Completed
    } else {
        statusClass = 'invalid';
        statusText = 'Không hợp lệ'; // Invalid
        btnDisabled = true;
        btnText = 'Không khả dụng'; // Unavailable
    }


    // --- Optional Field HTML 생성 ---

    // 1. Staff Name (값이 있을 때만 표시 + 강조 스타일)
    const staffHtml = data.target == 'staff' 
        ? `<div class="info-row">
             <span class="label">Staff</span>
             <span class="value" style="color:#e91e63;">♥ ${data.target_name}</span>
           </div>` 
        : '';

    // 2. Escort Service (true일 때만 표시 + 상단 노란 박스)
    const escortHtml = data.use_escort 
        ? `<div class="escort-row">
             <span class="escort-label">🔔 Escort</span>
             <span class="escort-badge">Requested</span>
           </div>` 
        : '';

    // 3. Memo (값이 있을 때만 표시 + 하단 점선 박스)
    const memoHtml = data.memo 
        ? `<div class="memo-section">
             <div class="memo-title">📝 Ghi chú</div>
             <div class="memo-content">"${data.memo}"</div>
           </div>` 
        : '';

    // --- 전체 HTML 조립 ---
    const html = `
        <div class="ticket-card ${statusClass}">
            <div class="ticket-header">
                <div class="venue-name">${data.venue_name}</div>
		<div class="coupon-title">${couponTxt}</div>
                <span class="status-badge">${statusText}</span>
            </div>
            
            <div class="ticket-body">
                ${escortHtml}

                <div class="info-row">
                    <span class="label">Khách hàng</span>
                    <span class="value">${data.client_name}</span>
                </div>

                <div class="info-row">
                    <span class="label">Giờ đặt</span>
                    <span class="value">${data.date} ${data.time}</span>
                </div>

                <div class="info-row">
                    <span class="label">Số người</span>
                    <span class="value">${data.attendee} People</span>
                </div>

                ${staffHtml}

                ${memoHtml}
            </div>

            <div class="btn-container">
                <button id="btnUse" class="btn-use" ${btnDisabled ? 'disabled' : ''}>
                    ${btnText}
                </button>
            </div>
        </div>
    `;

    app.innerHTML = html;

    // 버튼 이벤트 연결
    const btnUse = document.getElementById('btnUse');
    if (btnUse && !btnDisabled) {
        btnUse.addEventListener('click', () => handleUseCoupon(data.coupon_token));
    }
}

// 4. 에러 화면 렌더링
function renderError(msg) {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="error-card">
            <h3 style="color:#ef4444; margin-bottom:10px; font-weight:800;">⚠️ ERROR</h3>
            <p style="color:#666; margin-bottom:20px; font-weight:500;">${msg}</p>
            <button class="btn-use" onclick="window.location.reload()">Scan Again</button>
        </div>
    `;
}

// 5. [API 연동] 쿠폰 사용 처리 함수

async function handleUseCoupon(token) {
    if (!token) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Coupon ID is missing.'
        });
        return;
    }

    // 1. Swal Confirm 창 띄우기
   const result = await Swal.fire({
        title: 'Sử dụng Coupon?', // Use Coupon?
        text: "Xác nhận sử dụng coupon này?", // Confirm to use this coupon?
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#333',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Sử dụng ngay', // Yes, Use it! (Use immediately)
        cancelButtonText: 'Hủy' // Cancel
    });



    // 취소했으면 중단
    if (!result.isConfirmed) return;

    // 2. 버튼 로딩 상태 전환
    const btn = document.getElementById('btnUse');
    const originalText = btn.innerText;
    btn.innerText = "Processing...";
    btn.disabled = true;
    btn.style.opacity = "0.7";

    try {
        // 3. 실제 API 호출 (GET 방식)
        // URL: https://doil.chickenkiller.com/lsh_api/api/coupon/use?coupon_id={id}
        const API_URL = API_HOST + '/coupon/use';
        
        const response = await fetch(`${API_URL}?coupon_token=${token}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // 서버 응답에 따른 성공/실패 처리
        // (서버가 성공 시 {success: true} 혹은 status 등을 준다고 가정)
        // 여기서는 에러가 안 나면 성공으로 간주하거나, data 내부 값을 체크하세요.
        
        // 4. 성공 알림
	await Swal.fire({
            icon: 'success',
            title: 'Thành công!', // Processed! -> Success!
            text: 'Đã xử lý coupon thành công!', // Coupon processed successfully!
            confirmButtonColor: '#333',
            confirmButtonText: 'OK'
        });




        // 화면 새로고침
        location.reload();

    } catch (e) {
        console.error(e);
        
        // 5. 실패 알림
	Swal.fire({
            icon: 'error',
            title: 'Thất bại', // Failed
            text: 'Xử lý coupon thất bại. Vui lòng thử lại.', // Failed to process coupon. Please try again.
            confirmButtonColor: '#333',
            confirmButtonText: 'Đóng' // Close
        });

        // 버튼 상태 원복
        btn.innerText = originalText;
        btn.disabled = false;
        btn.style.opacity = "1";
    }
}








// --- 메인 실행 로직 ---
let g_token = '';
document.addEventListener('DOMContentLoaded', async function () {
    g_token = getToken();
    
    // 토큰이 없으면 에러 표시 (테스트 시엔 주석 처리하고 더미데이터 호출 가능)
    if (!g_token) {
        // [개발용] 테스트를 위해 토큰이 없어도 더미데이터를 보여주려면 아래 주석 해제
        /*
        console.log("Dev Mode: Loading dummy data");
        const dummy = await fetchReservationData("TEST_TOKEN");
        renderView(dummy);
        return; 
        */

        renderError("No Valid Token Found.");
        return;
    }

    try {
        const data = await fetchReservationData(g_token);
        renderView(data);
    } catch (err) {
        renderError(err);
    }
});
