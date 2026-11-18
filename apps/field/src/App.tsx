import { Route, Routes } from "react-router";
import { ConfirmProvider, useTheme } from "@afisa/ui";
import { useSessionState, WorkProvider } from "./lib/session";
import { SignIn } from "./screens/SignIn";
import { Join } from "./screens/Join";
import { Waiting } from "./screens/Waiting";
import { Shell } from "./screens/Shell";
import { Today } from "./screens/Today";
import { LogEntry } from "./screens/LogEntry";
import { History } from "./screens/History";
import { Me } from "./screens/Me";
import { UpdatePrompt } from "./screens/UpdatePrompt";
import { Report } from "./screens/Report";
import { Review } from "./screens/Review";
import { FoodPrices } from "./screens/FoodPrices";
import { POLICY_META, PolicyGate } from "./screens/PolicyGate";
import { Policy } from "./screens/Policy";
import { Plan } from "./screens/Plan";
import { useLiveQuery } from "dexie-react-hooks";
import { POLICY_VERSION } from "@afisa/shared";
import { db } from "./lib/db";

export function App() {
  return (
    <ConfirmProvider>
      <UpdatePrompt />
      <Main />
    </ConfirmProvider>
  );
}

function Main() {
  useTheme();
  const session = useSessionState();
  // Agreed on this phone (maybe offline) but not yet recorded on the server.
  const localPolicy = useLiveQuery(async () => (await db.meta.get(POLICY_META))?.value as { version: string } | undefined, [], null);

  if (session.kind === "loading") {
    return (
      <main className="center-screen" aria-busy="true">
        <p>Inafungua…</p>
      </main>
    );
  }
  if (session.kind === "signedOut") return <SignIn />;

  const { me, fromCache } = session;
  const active = me.memberships.find((m) => m.status === "active");
  if (!active) {
    const waiting = me.memberships.find((m) => m.status === "pending" || m.status === "suspended");
    if (waiting) return <Waiting membership={waiting} name={me.name} />;
    const rejected = me.memberships.find((m) => m.status === "rejected");
    return <Join rejectedNote={rejected?.decisionNote ?? null} defaultName={me.name} defaultPhone={me.phone} />;
  }

  if (localPolicy === null) return null;
  if (me.policyVersion !== POLICY_VERSION && localPolicy?.version !== POLICY_VERSION) {
    return <PolicyGate onAccepted={() => undefined} />;
  }

  return (
    <WorkProvider value={{ me, membership: active, councilId: active.councilId, fromCache }}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Today />} />
          <Route path="andika/:type" element={<LogEntry />} />
          <Route path="andika/:type/:clientId" element={<LogEntry />} />
          <Route path="shughuli" element={<History />} />
          <Route path="ripoti" element={<Report />} />
          <Route path="ripoti/majibu" element={<Review />} />
          <Route path="bei" element={<FoodPrices />} />
          <Route path="mimi" element={<Me />} />
          <Route path="sera" element={<Policy />} />
          <Route path="malengo" element={<Plan />} />
          <Route path="*" element={<Today />} />
        </Route>
      </Routes>
    </WorkProvider>
  );
}
