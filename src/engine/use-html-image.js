import { useEffect, useState } from 'react'

/** Minimal image loader for Konva (avoids extra react-use-image dep). */
export default function useHtmlImage(url) {
  const [image, setImage] = useState(null)
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    if (!url) {
      setImage(null)
      setStatus('idle')
      return undefined
    }
    setStatus('loading')
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImage(img)
      setStatus('loaded')
    }
    img.onerror = () => {
      setImage(null)
      setStatus('failed')
    }
    img.src = url
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [url])

  return [image, status]
}
