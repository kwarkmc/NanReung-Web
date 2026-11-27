# 뮤지컬 〈난릉〉 웹 프로그램북

Figma 모바일 프로그램북을 옮긴 정적 웹사이트입니다. `docs/index.html`이 첫 화면이고 `docs/02.html`부터 `docs/31.html`까지가 나머지 페이지입니다. 공통 스타일은 `docs/styles.css`, 프로필 사진은 `docs/assets/`에 있습니다.

## 로컬에서 확인

Python 3에서 저장소 루트에서 다음 명령을 실행하고 `http://localhost:8000/`을 엽니다. 설치할 패키지나 빌드 단계는 없습니다.

```sh
python -m http.server 8000 --directory docs
```

목차에서 프로필로 이동하고 브라우저 뒤로 가기를 확인합니다. 1쪽의 이전 버튼과 31쪽의 다음 버튼이 서로 이어지는지 확인합니다.

## 스크롤 미리보기

`http://localhost:8000/scroll/`에서 미리보기를 엽니다. 목차 마지막 항목 아래에서 천천히 스크롤하면 시놉시스 제목과 본문이 차례로 떠오르며 선명해집니다. 손을 멈추면 전환도 멈추고, 반대로 밀면 전환이 되감깁니다. 목차의 프로필 링크를 누르면 같은 문서 안에서 해당 프로필로 이동합니다. 기기에서 모션 감소를 켜면 전환 효과 없이 읽을 수 있습니다.

미리보기 스타일과 스크롤 동작은 `docs/scroll/`에 있습니다. 본문을 바꿀 때는 `docs/`의 원본 HTML을 수정하고 Python 3.12에서 다음 명령으로 미리보기를 다시 생성하고 확인합니다. 패키지 설치가 필요 없습니다.

```sh
python scripts/build_scroll.py
python scripts/build_scroll.py --check
```

브라우저 회귀 테스트는 Node.js 24에서 실행합니다. Playwright를 설치한 뒤 iPhone 13과 Pixel 7 화면 크기로 터치 스크롤을 재현합니다. `node scripts/test_scroll.cjs <URL>`로 배포본에도 같은 테스트를 실행할 수 있습니다.

```sh
npm install --no-save --no-package-lock playwright@1.62.1
npx playwright install chromium
node scripts/test_scroll.cjs
```

## 캐스팅보드

- [캐스팅보드](https://kwarkmc.github.io/NanReung-Web/casting/)에서 배우 카드를 눌러 프로필을 엽니다. 이전·다음 버튼으로 12명을 순환하며, 닫기 버튼이나 바깥 영역을 누르면 목록으로 돌아갑니다.
- [스크롤 캐스팅보드](https://kwarkmc.github.io/NanReung-Web/casting/scroll/)에서 목록과 프로필을 세로로 읽습니다. 목록의 카드로 원하는 배우에게 바로 이동할 수 있습니다.

두 경로는 `scripts/casting_data.json`에 정의된 배우 정보와 `docs/casting/assets/`의 Figma 이미지 에셋을 공유합니다. 내용을 바꾼 후 Python 3.12에서 HTML을 다시 생성하세요. 브라우저 테스트는 위의 Playwright 설치 명령을 사용합니다.

```sh
python scripts/build_casting.py
python scripts/build_casting.py --check
node scripts/test_casting.cjs
```

## 배포

Figma 동기화 시 보존할 웹 변경과 배우별 사진 매핑은 [웹과 Figma 동기화](WEB_OVERRIDES.md)에 기록합니다.

`docs/`를 정적 호스팅의 공개 디렉터리로 사용합니다. Figma 원본의 임시 에셋 주소는 배포 파일에 포함하지 않습니다. 오프닝과 엔딩 영상, 연습 사진, 일부 본문은 Figma의 자리표시자를 반영합니다.

## 포스터 기반 디자인 테스트

`/test/` 아래에서 기존 프로그램북과 캐스팅보드의 버튼판·스크롤판을 새 디자인으로 확인합니다. 원본 HTML을 수정했다면 다음 명령으로 테스트판도 갱신하세요. 테스트판은 같은 본문과 사진을 사용하고 상단에 네 경로를 오가는 메뉴를 추가합니다.

```sh
python scripts/build_stage_preview.py
python scripts/build_stage_preview.py --check
node scripts/test_stage_preview.cjs
```

Playwright 설치는 위의 명령을 사용합니다. 공개 사이트를 점검하려면 `node scripts/test_stage_preview.cjs https://kwarkmc.github.io/NanReung-Web`를 실행하세요.
