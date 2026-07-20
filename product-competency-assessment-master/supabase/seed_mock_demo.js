// 데모용 목업 데이터 시딩 스크립트. 실행: `POSTGRES_URL_NON_POOLING=... node seed_mock_demo.js` (pg 패키지 필요).
// exam_attempts/retake_status/material_views를 지우고 다시 채우므로, 실제 운영 데이터가 쌓인 뒤에는 실행하지 말 것.
const { Client } = require('pg')

function rand(seed) { return seed }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }
function isoMinusDays(d, days) { const dt = new Date(d); dt.setDate(dt.getDate() - days); return dt }
function isoMinusHours(d, hours) { const dt = new Date(d); dt.setHours(dt.getHours() - hours); return dt }

async function main() {
  let connStr = process.env.POSTGRES_URL_NON_POOLING.replace(/\?sslmode=require.*$/, '')
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
  await client.connect()

  const NOW = new Date('2026-07-19T09:00:00+09:00')

  // ── 0. 회차 기간 설정 (5영업일 응시 기간, 현재 진행 중) ──
  const roundRes = await client.query("select id from exam_rounds where active=true limit 1")
  const roundId = roundRes.rows[0].id
  const opensAt = isoMinusDays(NOW, 6)
  const closesAt = isoMinusDays(NOW, -1)
  await client.query('update exam_rounds set opens_at=$1, closes_at=$2 where id=$3', [opensAt.toISOString(), closesAt.toISOString(), roundId])
  console.log('round period set:', opensAt.toISOString(), '~', closesAt.toISOString())

  // ── 1. 문항별 오답 보기 태그 세팅 (싱크 분석 레이어1/2/3 데모용) ──
  const qRes = await client.query("select id,qid,domain,tier,axis,options,correct_index from questions where status='published' order by qid")
  const questions = qRes.rows
  const TAGS = ['구버전 정책', '타 팀 용어', '유사 기능 혼동', '완전 무관']
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const n = q.options.length
    const tags = new Array(n).fill('')
    tags[q.correct_index] = '정답'
    const wrongIdxs = []
    for (let k = 0; k < n; k++) if (k !== q.correct_index) wrongIdxs.push(k)
    // 문항 인덱스에 따라 태그 분포를 다양하게(레이어1/2/3 골고루 나오도록) 순환 배정
    const cyclePool = i % 3 === 0 ? ['구버전 정책', '유사 기능 혼동', '완전 무관']
      : i % 3 === 1 ? ['타 팀 용어', '완전 무관', '구버전 정책']
        : ['유사 기능 혼동', '타 팀 용어', '완전 무관']
    wrongIdxs.forEach((idx, k) => { tags[idx] = cyclePool[k % cyclePool.length] })
    await client.query('update questions set option_tags=$1 where id=$2', [JSON.stringify(tags), q.id])
  }
  console.log('option_tags set on', questions.length, 'questions')

  // ── 2. 대상팀 선정 및 exam_round_targets 배정 ──
  // 1차 시험 실제 대상자는 영업본부(세일즈본부) 산하 인원만. team 컬럼은 하위 팀명이 제각각이라
  // org_path(전체 조직 경로 문자열)에 '세일즈본부'가 포함되는지로 판별해야 본부장 등 team 컬럼이
  // 상위 그룹명으로 기록된 케이스(예: CBO그룹 소속으로 표기된 세일즈본부장)까지 정확히 잡힌다.
  const empRes = await client.query(
    `select emp_no,name,email,team from employees where status like '%재직%' and org_path ilike '%세일즈본부%'`
  )
  const employees = empRes.rows
  console.log('candidate employees in target org (영업본부/세일즈본부):', employees.length)

  const targetEmails = employees.map(e => e.email)
  // eligible=true 로 표시(전역 평가대상 후보군) + cluster='A' 지정
  await client.query(
    `update employees set eligible=true, cluster='A' where email = any($1)`,
    [targetEmails]
  )

  for (const e of employees) {
    await client.query(
      `insert into exam_round_targets(round_id, email, assigned_at) values ($1,$2,$3)
       on conflict (round_id, email) do nothing`,
      [roundId, e.email, isoMinusDays(NOW, 6).toISOString()]
    )
  }
  console.log('targets assigned:', employees.length)

  // 팀별 스킬 모디파이어 (팀마다 살짝 다른 약점 도메인을 갖도록 데모 다양성 부여) — 영업본부(세일즈본부) 산하 팀만
  const TEAM_WEAK_DOMAIN = {
    '세일즈본부': 'POS 자동연동', 'CBO그룹': 'POS 자동연동', '채널세일즈실': 'POS 자동연동',
    '채널세일즈팀': 'POS 자동연동', '채널매니지먼트팀': 'POS 자동연동', '리텐션팀': '티오더 AI',
    '인바운드세일즈팀': '기본 IT 용어', '아웃바운드세일즈팀': '기본 IT 용어',
  }

  // ── 3. 응시자(약 82%) 선정 후 exam_attempts 생성 ──
  const attendees = shuffle(employees).slice(0, Math.round(employees.length * 0.82))
  let passCount = 0, failCount = 0
  const failedPeople = []

  for (let i = 0; i < attendees.length; i++) {
    const person = attendees[i]
    const weakDomain = TEAM_WEAK_DOMAIN[person.team] || null
    const ability = (Math.random() + Math.random()) / 2 // 0~1, 0.5 중심 삼각분포(극단치 완화)
    const submittedAt = isoMinusHours(NOW, randInt(6, 140))
    const startedAt = new Date(submittedAt.getTime() - randInt(6, 20) * 60000)

    // Tier0(필수영역, 9문항)은 90%(=사실상 전부 정답) 이상을 요구하는 과락 게이트다.
    // 문항 단위 독립확률을 9번 곱하면 지나치게 가혹해지므로, 사람 단위로
    // "이번엔 필수영역을 다 맞혔는가"를 먼저 결정한 뒤 문항 정오답을 채운다.
    const tier0Clear = Math.random() < (0.32 + ability * 0.62)

    const answers = {}
    let correct = 0, tier0Count = 0, tier0Correct = 0
    for (const q of questions) {
      let correctProb
      if (q.tier === 0) {
        correctProb = tier0Clear ? 1 : (0.55 + ability * 0.25)
        if (!tier0Clear && weakDomain && q.domain === weakDomain) correctProb -= 0.15
      } else {
        correctProb = 0.55 + ability * 0.35 // 0.55~0.90
        if (weakDomain && q.domain === weakDomain) correctProb -= 0.24
      }
      correctProb = Math.max(0.15, Math.min(1, correctProb))

      const isCorrect = Math.random() < correctProb
      const selected = isCorrect ? q.correct_index : pick(q.options.map((_, idx) => idx).filter(idx => idx !== q.correct_index))
      const changes = Math.random() < 0.22 ? randInt(1, 3) : 0
      const firstAt = new Date(startedAt.getTime() + randInt(5, 300) * 1000)
      const lastAt = changes > 0 ? new Date(firstAt.getTime() + randInt(5, 90) * 1000) : firstAt
      const lateChange = changes > 0 && (submittedAt - lastAt) <= 10000

      answers[q.id] = { selected, correct: q.correct_index, changes, first_at: firstAt.toISOString(), last_at: lastAt.toISOString(), late_change: lateChange }
      if (selected === q.correct_index) { correct++; if (q.tier === 0) tier0Correct++ }
      if (q.tier === 0) tier0Count++
    }

    const score = Math.round((correct / questions.length) * 100)
    const tier0Score = tier0Count > 0 ? Math.round((tier0Correct / tier0Count) * 100) : 100
    const passed = score >= 75 && tier0Score >= 90

    await client.query(
      `insert into exam_attempts(user_email, round_id, is_retake, started_at, submitted_at, answers, score, passed)
       values ($1,$2,false,$3,$4,$5,$6,$7)`,
      [person.email, roundId, startedAt.toISOString(), submittedAt.toISOString(), JSON.stringify(answers), score, passed]
    )

    if (passed) passCount++
    else { failCount++; failedPeople.push({ ...person, firstScore: score, firstSubmittedAt: submittedAt }) }

    // 학습자료 열람 로그 (역량 높은 사람일수록 더 많이 열람하는 경향)
    const pages = ['study', 'v2', 'guide', 'pos']
    const viewCount = ability > 0.5 ? randInt(2, 4) : randInt(0, 2)
    const viewedPages = shuffle(pages).slice(0, viewCount)
    for (const p of viewedPages) {
      const viewedAt = new Date(startedAt.getTime() - randInt(1, 4) * 3600000)
      await client.query(`insert into material_views(user_email, page, viewed_at) values ($1,$2,$3)`, [person.email, p, viewedAt.toISOString()])
    }
  }
  console.log(`attempts created: ${attendees.length} (pass ${passCount} / fail ${failCount})`)

  // ── 4. 재시험 처리: 불합격자 중 절반은 재응시(is_retake=true) 완료, 나머지는 retake_status 다양화 ──
  const shuffledFailed = shuffle(failedPeople)
  const half = Math.ceil(shuffledFailed.length / 2)
  const retaken = shuffledFailed.slice(0, half)
  const notYetRetaken = shuffledFailed.slice(half)

  for (const person of retaken) {
    const retakeSubmittedAt = new Date(person.firstSubmittedAt.getTime() + randInt(1, 3) * 86400000)
    if (retakeSubmittedAt > NOW) retakeSubmittedAt.setTime(NOW.getTime() - randInt(1, 6) * 3600000)
    const retakeStartedAt = new Date(retakeSubmittedAt.getTime() - randInt(6, 18) * 60000)
    const improvedAbility = Math.min(0.95, Math.random() * 0.3 + 0.6) // 재시험은 대체로 더 잘 봄(학습자료 재열람 반영)
    const retakeTier0Clear = Math.random() < 0.75 // 재시험 응시자는 필수영역 재점검을 거쳐 대부분 통과
    const answers = {}
    let correct = 0, tier0Count = 0, tier0Correct = 0
    for (const q of questions) {
      const correctProb = q.tier === 0
        ? (retakeTier0Clear ? 1 : 0.7)
        : Math.max(0.3, Math.min(0.95, improvedAbility))
      const isCorrect = Math.random() < correctProb
      const selected = isCorrect ? q.correct_index : pick(q.options.map((_, idx) => idx).filter(idx => idx !== q.correct_index))
      answers[q.id] = { selected, correct: q.correct_index, changes: 0, first_at: retakeStartedAt.toISOString(), last_at: retakeStartedAt.toISOString(), late_change: false }
      if (selected === q.correct_index) { correct++; if (q.tier === 0) tier0Correct++ }
      if (q.tier === 0) tier0Count++
    }
    const score = Math.round((correct / questions.length) * 100)
    const tier0Score = tier0Count > 0 ? Math.round((tier0Correct / tier0Count) * 100) : 100
    const passed = score >= 75 && tier0Score >= 90

    await client.query(
      `insert into exam_attempts(user_email, round_id, is_retake, started_at, submitted_at, answers, score, passed)
       values ($1,$2,true,$3,$4,$5,$6,$7)`,
      [person.email, roundId, retakeStartedAt.toISOString(), retakeSubmittedAt.toISOString(), JSON.stringify(answers), score, passed]
    )
    await client.query(
      `insert into retake_status(round_id, email, status, updated_at) values ($1,$2,'completed',$3)
       on conflict (round_id, email) do update set status=excluded.status, updated_at=excluded.updated_at`,
      [roundId, person.email, retakeSubmittedAt.toISOString()]
    )
  }
  console.log('retaken (completed):', retaken.length)

  const STATUS_POOL = ['notice_needed', 'notice_sent', 'notice_sent', 'in_progress']
  for (let i = 0; i < notYetRetaken.length; i++) {
    const person = notYetRetaken[i]
    const status = STATUS_POOL[i % STATUS_POOL.length]
    await client.query(
      `insert into retake_status(round_id, email, status, updated_at) values ($1,$2,$3,$4)
       on conflict (round_id, email) do update set status=excluded.status, updated_at=excluded.updated_at`,
      [roundId, person.email, status, isoMinusHours(NOW, randInt(2, 48)).toISOString()]
    )
  }
  console.log('retake_status set for remaining:', notYetRetaken.length)

  // ── 5. product_updates 샘플 ──
  const updates = [
    { title: 'POS 자동연동 오류코드 체계 개편', domain: 'POS 자동연동', description: '기존 3자리 오류코드를 5자리 체계로 전면 개편. 매장 문의 시 신규 코드 기준으로 안내 필요.', days_ago: 18 },
    { title: '티오더 AI 메뉴 추천 로직 v2 배포', domain: '티오더 AI', description: '추천 알고리즘이 주문 이력 기반에서 시간대·날씨 반영 방식으로 변경.', days_ago: 11 },
    { title: '계약 재계약 시 위약금 산정 기준 변경', domain: '기본 IT 용어', description: '위약금 산정 기준일이 계약 체결일에서 최초 결제일로 변경.', days_ago: 7 },
    { title: '관리자 콘솔 권한 정책 업데이트', domain: 'POS 자동연동', description: 'operator 권한으로도 회차 활성화가 가능하도록 변경.', days_ago: 3 },
  ]
  for (const u of updates) {
    await client.query(
      `insert into product_updates(title, domain, description, published_at, created_by) values ($1,$2,$3,$4,$5)`,
      [u.title, u.domain, u.description, isoMinusDays(NOW, u.days_ago).toISOString(), 'yeoul@torder.com']
    )
  }
  console.log('product_updates inserted:', updates.length)

  // ── 6. admin_audit_log 샘플 이력 ──
  const auditEntries = [
    { action: 'round.create', detail: `${'1차 · 2026년 정기 역량평가'} 생성, 대상자 ${employees.length}명 배정`, days_ago: 6 },
    { action: 'question.publish', detail: '문항 24건 발행(published) 처리', days_ago: 6 },
    { action: 'admin.add', detail: 'yeoul@torder.com super_admin 등록', days_ago: 7 },
    { action: 'policy.update', detail: '합격선 75%, Tier0 과락선 90%로 설정', days_ago: 6 },
    { action: 'retake.notice_sent', detail: `재시험 대상자 ${notYetRetaken.filter(p=>true).length}명 중 일부에게 안내 발송`, days_ago: 1 },
  ]
  for (const a of auditEntries) {
    await client.query(
      `insert into admin_audit_log(actor_email, action, detail, created_at) values ($1,$2,$3,$4)`,
      ['yeoul@torder.com', a.action, a.detail, isoMinusDays(NOW, a.days_ago).toISOString()]
    )
  }
  console.log('admin_audit_log inserted:', auditEntries.length)

  await client.end()
  console.log('DONE')
}

main().catch(e => { console.error(e); process.exit(1) })
