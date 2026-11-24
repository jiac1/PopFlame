// Arranque del panel (admin/panel.html): pide sesión activa y abre el panel. En un archivo aparte
// para que la Content-Security-Policy pueda bloquear todo script en línea.
(async () => {
    const profile = await AdminAuth.requireAuth();
    if (profile) AdminPanel.init(profile);
})();
