import { useEffect, useState } from "react";

export default function InstallButton() {

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {

    console.log("InstallButton mounted");

    const handler = (e:any) => {

      console.log("beforeinstallprompt fired");

      e.preventDefault();

      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);

    if (
      window.matchMedia("(display-mode: standalone)").matches
    ) {
      setIsInstalled(true);
    }

    window.addEventListener("appinstalled", () => {
      console.log("App installed");
      setIsInstalled(true);
    });

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handler
      );
    };

  }, []);

  const install = async () => {

    if (!deferredPrompt) return;

    deferredPrompt.prompt();

    const choice = await deferredPrompt.userChoice;

    console.log(choice.outcome);

    setDeferredPrompt(null);
  };

  if (isInstalled) return null;

  return (
    <button
      onClick={install}
      style={{
        position:"fixed",
        bottom:"24px",
        right:"24px",
        zIndex:999999,
        background:"#000",
        color:"#fff",
        padding:"16px 22px",
        borderRadius:"999px",
        border:"none",
        cursor:"pointer",
        fontWeight:"700"
      }}
    >
      Download App
    </button>
  );
}