// 공용 인증 모듈. 모든 페이지에서 아래 순서로 로드:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
//   <script src="/shared/config.js"></script>
//   <script src="/shared/auth.js"></script>
// 패턴 출처: html-editor-deploy/index.html (Google Identity Services + Supabase signInWithIdToken, @torder.com 도메인 검증)

const AUTH = (() => {
  const cfg = window.APP_CONFIG
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
  let _gsNonce = null

  function pathTo(page) {
    // /admin/dashboard.html 같은 서브폴더 페이지에서도 루트 기준 절대경로로 이동
    return '/' + page.replace(/^\//, '')
  }

  function decodeJwtPayload(jwt) {
    // JWT는 base64url(― '-'/'_'  사용, 패딩 없음) 인코딩이라 atob()에 바로 넣으면 깨진다.
    let b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    return JSON.parse(decodeURIComponent(escape(atob(b64))))
  }

  async function getRole(email) {
    const { data } = await sb.from('admins').select('role').eq('email', email).maybeSingle()
    return data ? data.role : 'test_taker' // super_admin | operator | viewer | test_taker
  }

  // ── 로그인 페이지(index.html) 전용 ──
  async function setupGoogleSignIn(buttonElId, onError) {
    if (typeof google === 'undefined' || !google.accounts) {
      window.onGoogleLibraryLoad = () => setupGoogleSignIn(buttonElId, onError)
      return
    }
    const arr = new Uint8Array(32)
    crypto.getRandomValues(arr)
    _gsNonce = btoa(String.fromCharCode(...arr))
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(_gsNonce))
    const hashedNonce = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')

    google.accounts.id.initialize({
      client_id: cfg.GOOGLE_CLIENT_ID,
      callback: (response) => handleGoogleSignIn(response, onError),
      nonce: hashedNonce,
      auto_select: false,
    })
    google.accounts.id.renderButton(document.getElementById(buttonElId), {
      type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', locale: 'ko',
    })
  }

  async function handleGoogleSignIn(response, onError) {
    const payload = decodeJwtPayload(response.credential)
    const email = payload?.email || ''
    if (!email.endsWith('@' + cfg.ALLOWED_DOMAIN)) {
      onError && onError(`@${cfg.ALLOWED_DOMAIN} 이메일만 접근 가능합니다. (현재: ${email})`)
      return
    }
    const signInOpts = { provider: 'google', token: response.credential }
    if (_gsNonce) signInOpts.nonce = _gsNonce
    const { data, error } = await sb.auth.signInWithIdToken(signInOpts)
    if (error) {
      onError && onError('로그인 실패: ' + error.message)
      return
    }
    location.href = pathTo('exam.html')
  }

  // ── 모든 보호된 페이지 공통 가드 ──
  // opts.admin=true 인 페이지는 admins 테이블에 등록된 사용자만 통과, 아니면 exam.html로 리다이렉트
  async function requirePage(opts = {}) {
    const { data: { session } } = await sb.auth.getSession()
    if (!session) {
      location.href = pathTo('index.html')
      return null
    }
    const email = session.user.email
    const role = await getRole(email)
    if (opts.admin && role === 'test_taker') {
      location.href = pathTo('exam.html')
      return null
    }
    return { email, role, user: session.user }
  }

  async function signOut() {
    await sb.auth.signOut()
    location.href = pathTo('index.html')
  }

  return { sb, requirePage, setupGoogleSignIn, signOut, getRole }
})()
