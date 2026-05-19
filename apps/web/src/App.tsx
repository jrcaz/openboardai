import { Route, Switch } from 'wouter'
import { Index } from './routes/Index'
import { BoardPage } from './routes/Board'
import { ApiKeyProvider } from './settings/useApiKey'
import { ApiKeyGate } from './settings/ApiKeyGate'
import { ModelPreferencesProvider } from './settings/useModelPreferences'

export function App() {
  return (
    <ApiKeyProvider>
      <ModelPreferencesProvider>
        <ApiKeyGate>
          <Switch>
            <Route path="/" component={Index} />
            <Route path="/b/:boardId" component={BoardPage} />
            <Route>
              <div className="p-6 text-sm text-neutral-600">Not found.</div>
            </Route>
          </Switch>
        </ApiKeyGate>
      </ModelPreferencesProvider>
    </ApiKeyProvider>
  )
}
