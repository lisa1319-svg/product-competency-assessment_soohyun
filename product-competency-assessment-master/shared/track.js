// 학습자료 열람 추적 모듈 — 싱크미스 원인 분석(레이어1 vs 레이어2/3, 자료 효과성 분석)을 위해
// material_views 테이블에 로그를 기록합니다. 페이지 이탈 시점에 체류 시간(duration_seconds)도 갱신합니다.
// 사용: 각 학습자료 페이지에서 AUTH.requirePage() 성공 직후 logMaterialView('study') 호출

async function logMaterialView(page) {
  try {
    const sessionRes = await AUTH.sb.auth.getSession()
    const session = sessionRes && sessionRes.data && sessionRes.data.session
    const user = session && session.user
    if (!user || !user.email) return

    const startedAt = Date.now()
    const { data, error } = await AUTH.sb.from('material_views').insert([{
      user_email: user.email,
      page: page,
      viewed_at: new Date().toISOString()
    }]).select('id').single()

    if (error) { console.log('[track]', page, 'log error:', error.message); return }
    const viewId = data && data.id
    if (!viewId) return

    const cfg = window.APP_CONFIG
    const accessToken = session.access_token

    const sendDuration = () => {
      const seconds = Math.round((Date.now() - startedAt) / 1000)
      if (seconds < 1) return
      const url = `${cfg.SUPABASE_URL}/rest/v1/material_views?id=eq.${viewId}`
      fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ duration_seconds: seconds }),
        keepalive: true
      }).catch(() => {})
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') sendDuration()
    })
    window.addEventListener('pagehide', sendDuration)
  } catch (e) {
    console.log('[track] exception:', e.message)
  }
}
