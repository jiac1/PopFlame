// Página del link "Recuperar contraseña" (admin/restablecer.html).
// Supabase manda un correo con un link a esta página; supabase-js lee el código del link, abre una
// sesión temporal de recuperación y aquí se elige la contraseña nueva.
(async () => {
    const intro = document.getElementById('resetIntro');
    const form = document.getElementById('resetForm');
    const err = document.getElementById('resetError');
    const btn = document.getElementById('resetBtn');
    const pass = document.getElementById('newPass');
    const pass2 = document.getElementById('newPass2');

    const expired = () => {
        form.hidden = true;
        intro.textContent = 'El link no es válido o ya venció (dura poco tiempo y sirve una sola vez). Vuelve a Ingresar y toca "¿Olvidaste tu contraseña?" para pedir uno nuevo.';
    };
    let shown = false;
    const showForm = () => {
        if (shown) return;
        shown = true;
        intro.textContent = 'Elige la contraseña nueva para entrar al panel.';
        form.hidden = false;
        pass.focus();
    };

    // El link trae el error en la URL si venció (#error_code=otp_expired).
    const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
    if (params.get('error') || params.get('error_code')) { expired(); return; }

    if (typeof supabaseClient === 'undefined') { intro.textContent = 'No se pudo cargar la página. Revisa tu conexión.'; return; }
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) showForm();
    });
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) showForm();
    else setTimeout(() => { if (!shown) expired(); }, 2500);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.hidden = true;
        const fail = (msg) => { err.textContent = msg; err.hidden = false; };
        if (pass.value.length < 8) return fail('La contraseña debe tener al menos 8 caracteres.');
        if (pass.value.length > 72) return fail('La contraseña puede tener como máximo 72 caracteres.');
        if (pass.value !== pass2.value) return fail('Las contraseñas no coinciden.');

        btn.classList.add('is-loading');
        const { error } = await supabaseClient.auth.updateUser({ password: pass.value });
        btn.classList.remove('is-loading');
        if (error) {
            const msg = error.message || '';
            if (/different from the old|same_password/i.test(msg + error.code)) return fail('La contraseña nueva debe ser distinta a la anterior.');
            if (/weak|short|at least/i.test(msg)) return fail('La contraseña es muy débil. Usa al menos 8 caracteres, mezclando letras y números.');
            if (/session|expired|jwt/i.test(msg)) return expired();
            return fail('No se pudo guardar la contraseña: ' + msg);
        }
        // Se cierra la sesión de recuperación: se entra de nuevo con la contraseña nueva.
        await supabaseClient.auth.signOut().catch(() => {});
        form.hidden = true;
        intro.innerHTML = 'Listo, tu contraseña se cambió. <a href="index.html">Ingresa al panel</a> con tu correo y la contraseña nueva.';
    });
})();
