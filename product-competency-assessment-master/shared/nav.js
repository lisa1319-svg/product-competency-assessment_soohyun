// 관리자 사이드바+상단바 렌더링 (18페이지 shell 전용).
// renderAdminShell({ role, current, email, rounds, activeRoundId, onRoundChange, sidebarMount, topbarMount })
//   - current는 '/'로 시작하는 절대경로 (예: '/admin/dashboard.html')
//   - rounds: [{id,label}] (exam_rounds 조회 결과), onRoundChange: (roundId) => void
//   - 페이지 body에는 shared/admin-design.css의 .shell 그리드가 필요: <nav id="sidebar"></nav><header id="topbar"></header><main class="main">...
// 시험자 페이지(exam/study/v2/guide/pos/notice.html)는 각자 정적 aside 마크업을 직접 갖고 있어 이 파일을 쓰지 않는다.

const ADMIN_NAV = [
  { id: 'overview', href: '/admin/dashboard.html', label: '종합 현황' },
  { group: 'analysis', groupLabel: '분석', id: 'areaSummary', href: '/admin/analysis-area.html', label: '영역별 결과 요약' },
  { group: 'analysis', groupLabel: '분석', id: 'questionAnalysis', href: '/admin/analysis-questions.html', label: '문항별 상세 분석' },
  { group: 'analysis', groupLabel: '분석', id: 'syncAnalysis', href: '/admin/sync.html', label: '내부 싱크 분석' },
  { group: 'operations', groupLabel: '평가 운영', id: 'evaluationList', href: '/admin/rounds.html', label: '평가 목록' },
  { group: 'operations', groupLabel: '평가 운영', id: 'evaluationCreate', href: '/admin/round-create.html', label: '평가 만들기' },
  { group: 'people', groupLabel: '개인·재시험 관리', id: 'personalResults', href: '/admin/person.html', label: '개인별 결과' },
  { group: 'people', groupLabel: '개인·재시험 관리', id: 'retakeManagement', href: '/admin/retake.html', label: '응시자 관리' },
  { group: 'people', groupLabel: '개인·재시험 관리', id: 'finalResults', href: '/admin/final-results.html', label: '최종 결과' },
  { group: 'content', groupLabel: '콘텐츠 관리', id: 'learningMaterials', href: '/admin/materials.html', label: '학습자료' },
  { group: 'content', groupLabel: '콘텐츠 관리', id: 'glossaryManagement', href: '/admin/glossary.html', label: '용어집 관리' },
  { group: 'content', groupLabel: '콘텐츠 관리', id: 'questionBank', href: '/admin/questions.html', label: '문항 관리' },
  { group: 'settings', groupLabel: '설정', id: 'orgUsers', href: '/admin/org-users.html', label: '조직 · 사용자 관리' },
  { group: 'settings', groupLabel: '설정', id: 'adminRoles', href: '/admin/admin-roles.html', label: '관리자 권한' },
  { group: 'settings', groupLabel: '설정', id: 'notificationSettings', href: '/admin/notifications.html', label: '알림 설정' },
]

function renderAdminShell({ role, current, email, rounds = [], activeRoundId = null, onRoundChange, examType, onExamTypeChange, showExamTypeToggle = false, sidebarMount = 'sidebar', topbarMount = 'topbar' }) {
  window.__onAdminRoundChange = onRoundChange || function () { }
  window.__onAdminExamTypeChange = onExamTypeChange || function () { }

  const top = ADMIN_NAV.find(it => it.href === current)
  const groups = ['analysis', 'people', 'operations', 'content', 'settings']
  const groupLabels = { analysis: '분석', operations: '평가 운영', people: '개인·재시험 관리', content: '콘텐츠 관리', settings: '설정' }
  const currentGroup = top && top.group

  const overviewItem = ADMIN_NAV.find(it => it.id === 'overview')
  const overviewHtml = `
    <button class="nav-item ${current === overviewItem.href ? 'is-active' : ''}" onclick="location.href='${overviewItem.href}'">
      <span class="left">${overviewItem.label}</span>
    </button>`

  const groupsHtml = groups.map(g => {
    const items = ADMIN_NAV.filter(it => it.group === g)
    return `
    <div class="nav-label">${groupLabels[g]}</div>
    <div class="nav-sub" style="padding-left:12px;margin-top:-2px;">
      ${items.map(it => `
        <button class="${current === it.href ? 'active' : ''}" onclick="location.href='${it.href}'">${it.label}</button>
      `).join('')}
    </div>`
  }).join('')

  const sidebarEl = document.getElementById(sidebarMount)
  if (sidebarEl) {
    sidebarEl.innerHTML = `
      <div class="brand"><img src="/shared/logo-light-text.png" alt="t'order" style="height:20px;width:auto;"><span>역량평가</span></div>
      ${overviewHtml}
      ${groupsHtml}
      <div class="sidebar-foot">
        <button class="btn-chip" style="width:100%;" onclick="AUTH.signOut()">로그아웃</button>
      </div>
    `
  }

  const topbarEl = document.getElementById(topbarMount)
  if (topbarEl) {
    const leafLabel = top ? top.label : ''
    const groupLabel = currentGroup ? groupLabels[currentGroup] : '역량평가 관리자'
    const roundSelector = rounds.length ? `
      <select class="topbar-round-select" onchange="window.__onAdminRoundChange(this.value)">
        ${rounds.map(r => `<option value="${r.id}" ${r.id === activeRoundId ? 'selected' : ''}>${r.label}</option>`).join('')}
      </select>` : ''
    const examTypeValue = examType === '재시험' ? '재시험' : '본시험'
    const examTypeToggle = showExamTypeToggle ? `
      <div class="segmented-toggle" role="group" aria-label="시험 구분">
        <button type="button" class="${examTypeValue === '본시험' ? 'active' : ''}" onclick="window.__onAdminExamTypeChange('본시험')">본시험</button>
        <button type="button" class="${examTypeValue === '재시험' ? 'active' : ''}" onclick="window.__onAdminExamTypeChange('재시험')">재시험</button>
      </div>` : ''
    const activeRoundLabel = rounds.find(r => r.id === activeRoundId)?.label || ''
    const examTypeChip = showExamTypeToggle ? `
      <span class="context-chip">${activeRoundLabel}${activeRoundLabel ? ' · ' : ''}${examTypeValue === '재시험' ? '재시험 비교 모드' : '본시험'}</span>` : ''
    topbarEl.innerHTML = `
      <div class="topbar-crumb">${groupLabel} <span>／</span> <b>${leafLabel}</b>${roundSelector}${examTypeToggle}${examTypeChip}</div>
      <div class="topbar-user">
        <span class="name">${email || ''}</span>
        <a class="btn-chip" href="/exam.html" style="text-decoration:none;">시험자 화면</a>
        <button class="btn-chip" onclick="AUTH.signOut()">로그아웃</button>
      </div>
    `
  }
}
