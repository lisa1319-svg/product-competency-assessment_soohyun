// 학습글 게시판 데이터. 새 게시글(HTML 파일)을 받으면 이 배열에 한 줄 추가하면 된다.
// category: '티오더AI' | '어드민' | 'POS연동' (learn.html 카테고리 필터와 문자열이 정확히 일치해야 함)
// url: 실제 게시글 HTML 파일 경로 (learn-posts/ 아래 정적 파일, 또는 외부 링크도 가능)
// examScope: true면 study.html(학습 자료) 카드에도 노출됨
const LEARN_POSTS = [
  {
    id: 'pos-integration',
    category: 'POS연동',
    title: 'POS·외부솔루션연동 이해하기 — 채널플랫폼과 상품등록간편화',
    summary: '채널플랫폼이 왜 필요한지, 포스 기준 모드와 어드민 관리 모드가 왜 다른지 정리했습니다.',
    date: '2026-07-19',
    url: 'learn-posts/pos-integration.html',
    examScope: false,
  },
  {
    id: 'channel-admin',
    category: '어드민',
    title: '어드민 이해하기 — 채널관리자 (파트너사 대상) ※ 범위 한정',
    summary: '채널관리자는 POS/VAN/PG사 등 외부 파트너 관리용 어드민입니다. 사장님용 티오더관리자는 별도 자료 확보 필요.',
    date: '2026-07-19',
    url: 'learn-posts/channel-admin.html',
    examScope: false,
  },
  {
    id: 'torder-ai',
    category: '티오더AI',
    title: '티오더AI 이해하기 — 사장님을 위한 카카오톡 AI 에이전트',
    summary: '사장님이 카카오톡 대화만으로 매장 운영을 처리하는 AI. 실제 기능·통계까지 상세히 정리했습니다.',
    date: '2026-07-19',
    url: 'learn-posts/torder-ai.html',
    examScope: false,
  },
];
