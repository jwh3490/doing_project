# 김해공항 국제선 여객 흐름 대시보드

김해공항에 국제선으로 도착한 여객 수를 월별로 살펴보고, 다음 6개월을 참고용으로 예측하는 React 대시보드입니다. 이 수치는 부산 방문 관광객 전체 인원이 아니라 공항 도착 여객 수라는 대리 지표입니다.

## 데이터

원본 CSV는 `data/raw/airport_international_arrivals.csv`에 둡니다. CSV 파일은 현재 `.gitignore`에서 제외합니다. 원본 자료의 재배포 조건을 확인하기 전까지 GitHub에 올리지 않으며, AWS 배포 때는 서버로 별도 전송해야 합니다.

`월합계` 행은 전체 월별 예측에, `공항별` 행은 출발 공항 선택 화면에 사용합니다. 프로그램은 월별 합계 중간 누락, 중복 월, 잘못된 날짜·여객 수, 공항별 합과 월합계의 불일치를 임의로 고치지 않고 읽기 쉬운 오류로 안내합니다. 출발 공항 기록이 없는 달은 0으로 채우지 않습니다.

## Windows 로컬 실행

부산 축제 캘린더를 사용하려면 공공데이터포털의 `부산광역시_부산축제정보 서비스` 활용신청 후 프로젝트 루트에 `.env`를 만들고 인증키를 설정합니다. `.env.example`을 복사해 사용할 수 있으며 실제 키는 Git에 포함되지 않습니다.

```dotenv
DATA_GO_KR_SERVICE_KEY=발급받은_인증키
```

먼저 VS Code에서 새 PowerShell 터미널을 열고 프로젝트 루트 `C:\Users\jwh34\project`에서 실행합니다.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m uvicorn app.main:app --reload --app-dir backend
```

백엔드가 실행 중인 상태에서 두 번째 PowerShell 터미널을 열고 프런트엔드 폴더에서 실행합니다.

```powershell
Set-Location C:\Users\jwh34\project\frontend
npm install
npm run dev
```

터미널에 표시되는 로컬 주소를 브라우저에서 엽니다. Python이 없거나 `python` 명령이 인식되지 않으면 Python 설치 및 VS Code 인터프리터 선택이 먼저 필요합니다. Node.js 설치 후 기존 터미널에 `node`가 보이지 않으면 새 터미널을 열어 주세요.

## 예측 방식과 검증

- 계절 기준선: 작년 같은 달의 여객 수를 기준으로 삼습니다.
- Holt-Winters: 최근 수준과 추세, 12개월 계절 패턴을 반영합니다.
- 최근 과거 구간을 6개월 단위로 나누어 두 방법의 평균 절대 오차(MAE)를 비교하고, 오차가 더 작은 방법을 사용합니다. 예측 참고 범위는 이 과거 오차를 바탕으로 한 근사치이지 보장된 범위가 아닙니다.
- 2020년 5~11월의 0은 원본에 기록된 값 그대로 사용합니다.

테스트는 프로젝트 루트에서 실행합니다.

```powershell
python -m pytest backend\tests
```

## Git과 배포

Git은 내 컴퓨터에서 변경 이력을 기록하고, GitHub는 그 저장소를 원격으로 보관·공유합니다. `git push`는 코드를 GitHub에 올리는 작업이며 AWS 서버 배포를 자동으로 뜻하지 않습니다. AWS 배포는 별도 단계로 서버 생성, 프로그램 설치, 코드와 원본 데이터 전송, 실행 확인 순서로 진행합니다.

Git에 올리기 전에 `git status --short`와 `git check-ignore -v .env example.pem data/raw/airport_international_arrivals.csv`로 비밀 파일과 원본 데이터가 제외되는지 확인합니다. 실제 `.env`, AWS 키, `.pem` 파일은 만들거나 저장소에 올리지 않습니다.

AWS 배포 전에는 EC2, 디스크, 공인 IPv4 또는 Elastic IP, 데이터 전송 비용을 AWS 요금 계산기로 확인합니다. SSH는 본인 IP만 허용하고 웹 포트만 공개합니다. DuckDNS는 서버의 공인 IP를 가리키게 설정하며, HTTPS는 인증서를 적용한 뒤 확인합니다. 요금과 보안 규칙을 설명하고 동의를 받기 전에는 AWS 리소스를 만들거나 삭제하지 않습니다.
