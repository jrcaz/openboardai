import { Route, Switch } from 'wouter'
import { Landing } from './routes/Landing'
import { BoardPage } from './routes/Board'
import { ApiKeyProvider } from './settings/useApiKey'
import { ApiKeyGate } from './settings/ApiKeyGate'
import { ModelPreferencesProvider } from './settings/useModelPreferences'
import { SubAgentsProvider } from './settings/useSubAgents'

export function App() {
  return (
    <ApiKeyProvider>
      <ModelPreferencesProvider>
        <SubAgentsProvider>
          <Switch>
            <Route path="/" component={Landing} />
            <Route path="/b/:boardId">
              <ApiKeyGate>
                <BoardPage />
              </ApiKeyGate>
            </Route>
            <Route>
              <div className="p-6 text-sm text-neutral-600">Not found.</div>
            </Route>
          </Switch>
        </SubAgentsProvider>
      </ModelPreferencesProvider>
    </ApiKeyProvider>
  )
}
