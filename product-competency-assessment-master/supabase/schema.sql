-- t'order 역량평가 시스템 통합 앱 스키마
-- 실행: Supabase 프로젝트의 SQL Editor에서 그대로 실행

create table if not exists admins (
  email text primary key,
  role text not null check (role in ('super_admin', 'operator', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists exam_rounds (
  id uuid primary key default gen_random_uuid(),
  label text not null,                 -- 예: '1차', '2차'
  active boolean not null default false,
  opens_at timestamptz,
  closes_at timestamptz,
  owner text,                          -- 평가 담당자 표시용 (자유 텍스트, 예: "Sales Enablement팀 고예린")
  time_limit_minutes integer,          -- 응시 제한 시간(분) — 기록용, exam.html에서 실제 타이머로 강제되지 않음
  purpose text,                        -- 평가 목적
  description text,                    -- 평가 설명
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  qid text unique,                      -- 원본 문항 ID (예: B01, P03, A05) — 참고/추적용
  tier smallint not null check (tier in (0, 1, 2)),
  cluster text,                         -- 'A'(대고객 접점) | 'B'(제품개발·공급) | 'C'(경영지원) | null(전사공통)
  axis smallint check (axis between 1 and 5),  -- 5개 역량축
  domain text not null,                 -- 기본 IT 용어 | POS 자동연동 | 티오더 AI | 계약·재계약·분쟁 등
  type text not null default 'multiple_choice' check (type in ('multiple_choice', 'short_answer', 'essay')),
  question_text text not null,
  options jsonb,                        -- multiple_choice: ["보기1", "보기2", ...]
  correct_index smallint,               -- multiple_choice 정답 인덱스 (0-base)
  option_tags jsonb,                    -- 보기별 오답 성격 태그, options와 같은 순서: ["정답","구버전 정책","타 팀 용어","완전 무관"] 등. 싱크미스 원인 분석용(정답 인덱스는 태그 없이 빈 문자열로 둬도 됨)
  status text not null default 'draft' check (status in ('draft', 'published')),
  source_note text,                     -- R&D 확정 대기 사유 등 원본 메모 보존
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  round_id uuid references exam_rounds(id),
  is_retake boolean not null default false,  -- 같은 회차에서 재응시(이전 응시가 불합격이었던 경우)인지
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  -- answers shape: { "<question_id>": { selected, correct, changes, first_at, last_at, late_change } }
  -- selected/correct: 0-base 인덱스, changes: 답 변경 횟수, first_at/last_at: 최초/최종 선택 시각(ISO),
  -- late_change: 제출 10초 전 이내 마지막 변경이 있었는지(막판 흔들림 신호)
  answers jsonb,
  score numeric,                        -- 0~100
  passed boolean,
  created_at timestamptz not null default now()
);

-- 전 직원 명단(HR 인사정보 export 기반) — "누가 이번 평가를 봐야 하는지" 대상자 관리의 기준 데이터
create table if not exists employees (
  emp_no text primary key,
  name text not null,
  disp_name text,                       -- 회사 내 표시명 (예: "김도겸_IT서비스")
  email text unique not null,
  status text,                          -- 재직/퇴직 등
  team text,                            -- 가장 하위 조직 단위 — 팀별 집계 기준
  org_path text,                        -- 상위조직 계층을 " > "로 이어붙인 표시용 문자열
  position text,                        -- 직책
  eligible boolean not null default true, -- 평가 대상 후보군 포함 여부 (조직·사용자 관리에서 토글)
  cluster text,                         -- 'A'(대고객 접점군) 등 — 문항 cluster와 대응하는 조직 분류
  created_at timestamptz not null default now()
);

-- 회차별 평가 대상자 배정 — 평가 운영 화면에서 employees 중 이번 회차 대상을 선택
create table if not exists exam_round_targets (
  round_id uuid not null references exam_rounds(id) on delete cascade,
  email text not null,
  assigned_at timestamptz not null default now(),
  primary key (round_id, email)
);

-- 재시험 진행 상태 (mock 발송 버튼과 연동되는 실제 상태값)
create table if not exists retake_status (
  round_id uuid not null references exam_rounds(id) on delete cascade,
  email text not null,
  status text not null default 'notice_needed' check (status in ('notice_needed', 'notice_sent', 'in_progress', 'completed')),
  updated_at timestamptz not null default now(),
  primary key (round_id, email)
);

-- 관리자 조작 이력 (변경 이력)
create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,                 -- 예: 'question.publish', 'admin.add', 'round.create'
  detail text,
  created_at timestamptz not null default now()
);

-- 학습자료(용어집/가이드/POS/공지/학습자료) 열람 로그 — "자료 미숙지" vs "자료 미도달" 구분용
create table if not exists material_views (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  page text not null,                   -- 'study' | 'v2' | 'guide' | 'pos' | 'notice'
  viewed_at timestamptz not null default now(),
  duration_seconds numeric              -- 페이지 이탈/전환 시점에 클라이언트가 갱신(shared/track.js). 자료 효과성 분석용
);

-- 평가 정책 등 운영 기준값 (key-value). 예: pass_score, retake_score, sync_risk_threshold, retake_limit
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- 본시험 미응시자 독려 알림 발송 이력 (재시험은 retake_status로 별도 추적) — 종합현황의 "미응시자 독려 알림 발송" 발송 여부 판단용
create table if not exists exam_notice_log (
  round_id uuid not null references exam_rounds(id) on delete cascade,
  email text not null,
  sent_at timestamptz not null default now(),
  primary key (round_id, email)
);

-- 업데이트 관리(R&D 신규 기능/정책 변경 이력) — 싱크 분석에서 "해당 업데이트 관련 문항 오답률" 교차 확인용
create table if not exists product_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  domain text,
  description text,
  published_at timestamptz not null default now(),
  created_by text,
  created_at timestamptz not null default now()
);

-- ── RLS ──
alter table admins enable row level security;
alter table exam_rounds enable row level security;
alter table questions enable row level security;
alter table exam_attempts enable row level security;
alter table material_views enable row level security;
alter table employees enable row level security;
alter table exam_notice_log enable row level security;
alter table exam_round_targets enable row level security;
alter table retake_status enable row level security;
alter table admin_audit_log enable row level security;
alter table app_settings enable row level security;
alter table product_updates enable row level security;

-- admins: 로그인한 사용자는 자기 role 확인을 위해 전체 조회 가능, 쓰기(추가/제거)는 super_admin만
create policy admins_select on admins for select using (auth.role() = 'authenticated');
create policy admins_insert on admins for insert with check (
  exists (select 1 from admins a where a.email = auth.jwt() ->> 'email' and a.role = 'super_admin')
);
create policy admins_delete on admins for delete using (
  exists (select 1 from admins a where a.email = auth.jwt() ->> 'email' and a.role = 'super_admin')
);

-- exam_rounds: 로그인 사용자 전체 조회, 쓰기는 admins 테이블에 등록된 사용자만
create policy exam_rounds_select on exam_rounds for select using (auth.role() = 'authenticated');
create policy exam_rounds_write on exam_rounds for all using (
  exists (select 1 from admins where email = auth.jwt() ->> 'email')
);

-- questions: 로그인 사용자는 published 문항만 조회, admins는 전체(draft 포함) 조회 및 쓰기 가능
create policy questions_select_published on questions for select using (
  status = 'published' or exists (select 1 from admins where email = auth.jwt() ->> 'email')
);
create policy questions_write on questions for insert with check (
  exists (select 1 from admins where email = auth.jwt() ->> 'email')
);
create policy questions_update on questions for update using (
  exists (select 1 from admins where email = auth.jwt() ->> 'email')
);
create policy questions_delete on questions for delete using (
  exists (select 1 from admins where email = auth.jwt() ->> 'email')
);

-- exam_attempts: 본인 데이터만 조회/작성, admins는 전체 조회
create policy exam_attempts_insert_own on exam_attempts for insert with check (
  user_email = auth.jwt() ->> 'email'
);
create policy exam_attempts_select on exam_attempts for select using (
  user_email = auth.jwt() ->> 'email' or exists (select 1 from admins where email = auth.jwt() ->> 'email')
);

-- material_views: 본인 열람 기록만 작성, admins는 전체 조회(집계용)
create policy material_views_insert_own on material_views for insert with check (
  user_email = auth.jwt() ->> 'email'
);
create policy material_views_select on material_views for select using (
  user_email = auth.jwt() ->> 'email' or exists (select 1 from admins where email = auth.jwt() ->> 'email')
);
create policy material_views_update_own on material_views for update using (
  user_email = auth.jwt() ->> 'email'
) with check (
  user_email = auth.jwt() ->> 'email'
);

-- employees / exam_round_targets / retake_status / admin_audit_log: admins만 조회·쓰기 (HR 민감정보)
create policy employees_all on employees for all using (
  exists (select 1 from admins where email = auth.jwt() ->> 'email')
);
create policy exam_round_targets_all on exam_round_targets for all using (
  exists (select 1 from admins where email = auth.jwt() ->> 'email')
);
create policy retake_status_all on retake_status for all using (
  exists (select 1 from admins where email = auth.jwt() ->> 'email')
);
create policy admin_audit_log_all on admin_audit_log for all using (
  exists (select 1 from admins where email = auth.jwt() ->> 'email')
);

-- app_settings: admins만 조회·쓰기
create policy app_settings_all on app_settings for all using (
  exists (select 1 from admins where email = auth.jwt() ->> 'email')
);

-- exam_notice_log: admins만 조회·쓰기
create policy exam_notice_log_all on exam_notice_log for all using (
  exists (select 1 from admins where email = auth.jwt() ->> 'email')
);

-- product_updates: 로그인 사용자 전체 조회(싱크분석 참고용), 쓰기는 admins만
create policy product_updates_select on product_updates for select using (auth.role() = 'authenticated');
create policy product_updates_write on product_updates for all using (
  exists (select 1 from admins where email = auth.jwt() ->> 'email')
);

-- 용어집(admin/glossary.html에서 등록) — 기존 구글시트 용어집과 함께 v2.html에 병합되어 표시됨.
-- 구글시트 쪽 기존 용어를 대체하지 않고, "관리자 콘솔에서 새로 추가한 용어"만 이 테이블에 쌓인다.
-- created_at 기준으로 v2.html이 "새로 추가된 용어" NEW 배지를 계산한다.
create table if not exists glossary_terms (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('제품 용어', '추가 기능 용어', 'UX 용어', 'IT 용어', '종료 및 변경')),
  sub_category text,
  term text not null,
  definition text not null,
  note text,
  context text,
  audience jsonb not null default '["전체"]'::jsonb,  -- 예: ["영업"], ["CS","개발"], ["전체"]
  exam_scope boolean not null default false,           -- true면 study.html 학습자료 카드에도 노출
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table glossary_terms enable row level security;

-- glossary_terms: 로그인 사용자 전체 조회, 쓰기는 admins만 (product_updates와 동일 패턴)
create policy glossary_terms_select on glossary_terms for select using (auth.role() = 'authenticated');
create policy glossary_terms_write on glossary_terms for all using (
  exists (select 1 from admins where email = auth.jwt() ->> 'email')
);
