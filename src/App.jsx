import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StudioProvider } from './context/studio-provider'
import { StudioLayout } from './layout/studio-layout'
import MotionPage from './pages/motion-page'
import TextPage from './pages/text-page'
import FramesPage from './pages/frames-page'
import EditPage from './pages/edit-page'
import OutputPage from './pages/output-page'
import { ROUTES } from './lib/routes'

function GifApp() {
  return (
    <StudioProvider>
      <Routes>
        <Route element={<StudioLayout />}>
          <Route index element={<Navigate to="motion" replace />} />
          <Route path="motion" element={<MotionPage />} />
          <Route path="elements" element={<Navigate to="../motion" replace />} />
          <Route path="text" element={<TextPage />} />
          <Route path="frames" element={<FramesPage />} />
          <Route path="edit" element={<EditPage />} />
          <Route path="output" element={<OutputPage />} />
          <Route path="preview" element={<Navigate to="../motion" replace />} />
        </Route>
      </Routes>
    </StudioProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={ROUTES.home} element={<Navigate to={ROUTES.gif.motion} replace />} />
        <Route path={`${ROUTES.gif.root}/*`} element={<GifApp />} />
        <Route path="/preview" element={<Navigate to={ROUTES.gif.motion} replace />} />
        <Route path="*" element={<Navigate to={ROUTES.gif.motion} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
