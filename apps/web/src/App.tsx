import { Route, Switch } from 'wouter'
import { Index } from './routes/Index'
import { BoardPage } from './routes/Board'
import { ApiKeyProvider } from './settings/useApiKey'
import { ApiKeyGate } from './settings/ApiKeyGate'

export function App() {
  return (
    <ApiKeyProvider>
      <ApiKeyGate>
        <Switch>
          <Route path="/" component={Index} />
          <Route path="/b/:boardId" component={BoardPage} />
          <Route>
            <div className="p-6 text-sm text-neutral-600">Not found.</div>
          </Route>
        </Switch>
      </ApiKeyGate>
    </ApiKeyProvider>
  )
}
