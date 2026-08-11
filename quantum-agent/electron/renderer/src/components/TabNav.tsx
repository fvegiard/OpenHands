import { TABS, type TabId } from "../types";

interface Props {
  active: TabId;
  onChange: (tab: TabId) => void;
}

export default function TabNav({ active, onChange }: Props) {
  return (
    <nav className="tab-nav">
      {TABS.map((tab) => (
        <button
          type="button"
          key={tab.id}
          className={`tab-btn ${active === tab.id ? "tab-active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
