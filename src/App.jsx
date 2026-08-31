import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/error-boundary'
import { StudioProvider } from './context/studio-provider'
import { StudioLayout } from './layout/studio-layout'
import TextPage from './pages/text-page'
import ScalePage from './pages/scale-page'
import OutputPage from './pages/output-page'
import { ROUTES } from './lib/routes'

function ImageApp() {
  return (
    <ErrorBoundary>
      <StudioProvider>
        <Routes>
          <Route element={<StudioLayout />}>
            <Route index element={<Navigate to="ai" replace />} />
            <Route path="ai" element={null} />
            <Route path="elements" element={<Navigate to="../ai" replace />} />
            <Route path="text" element={<TextPage />} />
            <Route path="edit" element={<Navigate to="../ai" replace />} />
            <Route path="scale" element={<ScalePage />} />
            <Route path="output" element={<OutputPage />} />
            <Route path="preview" element={<Navigate to="../ai" replace />} />
          </Route>
        </Routes>
      </StudioProvider>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path={ROUTES.home} element={<Navigate to={ROUTES.studio.ai} replace />} />
          <Route path={`${ROUTES.studio.root}/*`} element={<ImageApp />} />
          <Route path="*" element={<Navigate to={ROUTES.studio.ai} replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
