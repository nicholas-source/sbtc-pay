import { NavLink } from "react-router-dom";
import { DOCS_NAV } from "../nav";
import { cn } from "@/lib/utils";

interface DocsSidebarProps {
  onNavigate?: () => void;
}

export function DocsSidebar({ onNavigate }: DocsSidebarProps) {
  return (
    <nav className="flex flex-col gap-space-lg py-space-lg" aria-label="Documentation sections">
      {DOCS_NAV.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <h3 className="px-3 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
            {section.label}
          </h3>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <li key={item.slug || "index"}>
                <NavLink
                  to={`/docs${item.slug ? `/${item.slug}` : ""}`}
                  end={item.slug === ""}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "block rounded-md px-3 py-1.5 text-body-sm transition-colors",
                      isActive
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )
                  }
                >
                  {item.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
