// Página de ingreso al panel (admin/index.html). Va en un archivo aparte (y no en un <script> dentro
// del HTML) para que la Content-Security-Policy pueda bloquear todo script en línea.
(async () => {
    // Si ya hay una sesión válida, directo al panel
    const profile = await AdminAuth.getActiveProfile();
    if (profile) { location.replace('panel.html'); return; }

    const form = document.getElementById('loginForm');
    const btn = document.getElementById('loginBtn');
    const err = document.getElementById('errorMsg');
    const user = document.getElementById('username');
    const pass = document.getElementById('password');

    // Recuerda el último correo usado (antes se guardaba el usuario; ese valor ya no sirve).
    try {
        const saved = localStorage.getItem('pf_admin_email') || localStorage.getItem('pf_admin_user') || '';
        user.value = saved.includes('@') ? saved : '';
    } catch (e) { /* sin storage */ }
    (user.value ? pass : user).focus();

    document.getElementById('togglePass').addEventListener('click', (e) => {
        const show = pass.type === 'password';
        pass.type = show ? 'text' : 'password';
        e.currentTarget.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
    document.getElementById('forgotBtn').addEventListener('click', () => {
        document.getElementById('forgotHelp').hidden = false;
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.hidden = true;
        btn.classList.add('is-loading');
        try {
            await AdminAuth.login(user.value.trim(), pass.value);
            try {
                localStorage.setItem('pf_admin_email', user.value.trim().toLowerCase());
                localStorage.removeItem('pf_admin_user');
            } catch (e2) { /* ignorado */ }
            location.replace('panel.html');
        } catch (error) {
            err.textContent = error.message || 'No se pudo iniciar sesión';
            err.hidden = false;
            btn.classList.remove('is-loading');
            pass.select();
        }
    });
})();
