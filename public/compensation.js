let token = '';
const $ = id => document.getElementById(id), esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function load() {
    try {
        $('error').textContent = '';
        if ($('key').value)
            token = $('key').value;
        const r = await fetch('/api/compensation-admin/claims', { headers: { 'X-Admin-Token': token } }), d = await r.json();
        if (!r.ok)
            throw new Error(d.error);
        $('key').value = '';
        $('claims').innerHTML = d.map(c => `<article class="card"><h3>${c.is_test ? 'TEST — ' : ''}${esc(c.id)}</h3><p>${esc(c.amount)} ${esc(c.currency)} · ${esc(c.status)}</p><p>${esc(c.contact?.email || 'No email supplied')}</p>${c.status === 'requested' ? `<button class="save-button" data-paid="${c.id}">Mark as paid after issuing gift card</button>` : ''}</article>`).join('');
        document.querySelectorAll('[data-paid]').forEach(b => b.onclick = async () => {
            if (!confirm('Confirm the gift card has actually been issued. This website does not issue payments.'))
                return;
            try {
                const r = await fetch('/api/compensation-admin/paid', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify({ claimId: b.dataset.paid }) });
                if (!r.ok)
                    throw new Error((await r.json()).error);
                await load();
            }
            catch (e) {
                $('error').textContent = e.message;
            }
        });
    }
    catch (e) {
        $('error').textContent = e.message;
    }
}
$('load').onclick = load;
$('logout').onclick = () => { token = ''; location.reload(); };
