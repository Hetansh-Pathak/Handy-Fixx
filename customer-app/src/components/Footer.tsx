import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";

const Footer = () => {
  const navigate = useNavigate();

  const links: Record<string, { label: string; href: string }[]> = {
    Company: [
      { label: "About Us",     href: "/about"       },
      { label: "Become a Pro", href: "/become-a-pro"},
      { label: "Contact Us",   href: "/contact"     },
    ],
    Services: [
      { label: "Plumbing",        href: "/services/plumbing"        },
      { label: "Electrical",      href: "/services/electrical"      },
      { label: "House Cleaning",  href: "/services/cleaning"        },
      { label: "AC Service",      href: "/services/ac-service"      },
      { label: "Home Salon",      href: "/services/salon"           },
    ],
    Resources: [
      { label: "Help Center",  href: "/contact"     },
      { label: "Safety",       href: "/about"       },
      { label: "Become a Pro", href: "/become-a-pro"},
    ],
    Legal: [
      { label: "Terms",   href: "#" },
      { label: "Privacy", href: "#" },
      { label: "Cookies", href: "#" },
    ],
  };

  return (
    <footer className="py-16 border-t border-border">
      <div className="container mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-1">
            <button className="flex items-center gap-2 mb-4" onClick={() => navigate("/")}>
              <img src={logo} alt="HandyFix" className="w-10 h-10 rounded-xl object-cover shadow-lg" />
              <span className="text-lg font-bold text-foreground">HandyFix</span>
            </button>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your trusted home services marketplace. Fast, reliable, guaranteed.
            </p>
          </div>

          {Object.entries(links).map(([title, items]) => (
            <div key={title}>
              <h4 className="font-bold text-foreground mb-4 text-sm uppercase tracking-wider">{title}</h4>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.label}>
                    <button
                      onClick={() => item.href !== "#" ? navigate(item.href) : undefined}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border mt-12 pt-8 text-center text-sm text-muted-foreground">
          © 2026 HandyFix. All rights reserved. Made with ❤️ in India.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
