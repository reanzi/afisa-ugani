import { Route, Routes } from "react-router";
import { useTheme } from "@afisa/ui";
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

export function App() {
  return (
    <>
      <UpdatePrompt />
      <Main />
    </>
  );
}

function Main() {
  useTheme();
  const session = useSessionState();

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
    return <Join rejectedNote={rejected?.decisionNote ?? null} defaultName={me.name} />;
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
          <Route path="*" element={<Today />} />
        </Route>
      </Routes>
    </WorkProvider>
  );
}
