let kakaoMapsPromise

export function loadKakaoMaps(appKey) {
  if (window.kakao?.maps) {
    return new Promise((resolve) => window.kakao.maps.load(() => resolve(window.kakao.maps)))
  }

  if (!appKey) {
    return Promise.reject(new Error('VITE_KAKAO_MAP_APP_KEY가 설정되지 않았습니다.'))
  }

  if (!kakaoMapsPromise) {
    kakaoMapsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false&libraries=services`
      script.async = true
      script.onload = () => {
        if (!window.kakao?.maps) {
          reject(new Error('카카오 지도 SDK를 불러오지 못했습니다.'))
          return
        }
        window.kakao.maps.load(() => resolve(window.kakao.maps))
      }
      script.onerror = () => reject(new Error('카카오 지도 SDK 요청에 실패했습니다. 앱 키와 등록 도메인을 확인해 주세요.'))
      document.head.appendChild(script)
    })
  }

  return kakaoMapsPromise
}
