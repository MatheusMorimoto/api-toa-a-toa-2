'use strict';

const byId = (id) => document.getElementById(id);
const apiKeyInput = byId('apiKey');
const productForm = byId('produtoForm');
const clientForm = byId('clienteForm');
const saleForm = byId('vendaForm');
let productsCache = [];
let saleItems = [];

function cell(row, value) {
    const td = document.createElement('td');
    td.textContent = value === null || value === undefined ? '' : String(value);
    row.appendChild(td);
    return td;
}

function button(label, className, handler) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    if (className) element.className = className;
    element.addEventListener('click', handler);
    return element;
}

async function request(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (apiKeyInput.value) headers.set('x-api-key', apiKeyInput.value);
    const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
    const type = response.headers.get('content-type') || '';
    const body = type.includes('application/json') ? await response.json() : { mensagem: await response.text() };
    if (!response.ok) throw new Error(body.mensagem || `Erro HTTP ${response.status}`);
    return body;
}

function setOptions(select, firstLabel, records, getLabel) {
    select.replaceChildren();
    const first = document.createElement('option');
    first.value = '';
    first.textContent = firstLabel;
    select.appendChild(first);
    records.forEach((record) => {
        const option = document.createElement('option');
        option.value = String(record.id);
        option.textContent = getLabel(record);
        select.appendChild(option);
    });
}

async function loadProducts() {
    const tbody = byId('produtosTable').tBodies[0];
    tbody.replaceChildren();
    try {
        const result = await request('/toa-toa-api-supabase');
        productsCache = result.dados || [];
        setOptions(byId('item_produto_id'), 'Selecione um produto', productsCache, (p) => `${p.nome} (Qtd: ${p.quantidade})`);
        productsCache.forEach((product) => {
            const row = document.createElement('tr');
            cell(row, product.id);
            const imageCell = document.createElement('td');
            if (product.imagem && product.imagem !== 'placeholder.jpg') {
                const image = document.createElement('img');
                image.className = 'thumb';
                image.alt = '';
                image.src = product.imagem;
                imageCell.appendChild(image);
            }
            row.appendChild(imageCell);
            cell(row, product.nome);
            cell(row, `R$ ${Number(product.preco_unitario || 0).toFixed(2)}`);
            cell(row, product.quantidade);
            const actions = document.createElement('td');
            actions.className = 'actions';
            actions.append(
                button('Detalhes', 'secondary', () => showProduct(product.id)),
                button('Editar', 'warning', () => editProduct(product.id)),
                button('Excluir', 'danger', () => deleteProduct(product.id))
            );
            row.appendChild(actions);
            tbody.appendChild(row);
        });
    } catch (error) {
        const row = document.createElement('tr');
        cell(row, error.message).colSpan = 6;
        tbody.appendChild(row);
    }
}

async function productById(id) {
    return (await request(`/toa-toa-api-supabase/${encodeURIComponent(id)}`)).dados;
}

async function editProduct(id) {
    try {
        const p = await productById(id);
        const fields = {
            produtoId: p.id, codProduto: p.cod, nomeProduto: p.nome, categoria: p.categoria,
            validade: p.validade, quantidade: p.quantidade, precoUnitario: p.preco_unitario,
            precoPacote: p.preco_pacote, descricao: p.descricao
        };
        Object.entries(fields).forEach(([field, value]) => { byId(field).value = value ?? ''; });
        byId('imagemProduto').value = '';
        productForm.scrollIntoView({ behavior: 'smooth' });
    } catch (error) { alert(error.message); }
}

async function showProduct(id) {
    try {
        const p = await productById(id);
        alert([
            `ID: ${p.id}`, `Código: ${p.cod || ''}`, `Nome: ${p.nome}`,
            `Categoria: ${p.categoria || ''}`, `Validade: ${p.validade || ''}`,
            `Quantidade: ${p.quantidade}`, `Preço unitário: R$ ${p.preco_unitario || 0}`,
            `Preço pacote: R$ ${p.preco_pacote || 0}`, `Descrição: ${p.descricao || ''}`
        ].join('\n'));
    } catch (error) { alert(error.message); }
}

async function deleteProduct(id) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    try {
        const result = await request(`/toa-toa-api-supabase/${encodeURIComponent(id)}`, { method: 'DELETE' });
        alert(result.mensagem);
        await loadProducts();
    } catch (error) { alert(error.message); }
}

productForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = byId('produtoId').value;
    const data = new FormData();
    ['codProduto', 'nomeProduto', 'categoria', 'validade', 'quantidade', 'precoUnitario', 'precoPacote', 'descricao']
        .forEach((field) => data.append(field, byId(field).value));
    if (byId('imagemProduto').files[0]) data.append('imagem', byId('imagemProduto').files[0]);
    try {
        const result = await request(id ? `/toa-toa-api-supabase/${encodeURIComponent(id)}` : '/toa-toa-api-supabase', {
            method: id ? 'PUT' : 'POST', body: data
        });
        alert(result.mensagem);
        productForm.reset();
        byId('produtoId').value = '';
        await loadProducts();
    } catch (error) { alert(error.message); }
});

async function loadClients() {
    const tbody = byId('clientesTable').tBodies[0];
    tbody.replaceChildren();
    try {
        const result = await request('/toa-toa-clientes');
        const clients = result.dados || [];
        setOptions(byId('venda_cliente_id'), 'Selecione um cliente', clients, (c) => c.nome_completo);
        clients.forEach((client) => {
            const row = document.createElement('tr');
            cell(row, client.id);
            cell(row, client.nome_completo);
            cell(row, client.whatsapp);
            const actions = document.createElement('td');
            actions.className = 'actions';
            actions.append(
                button('Editar', 'warning', () => editClient(client.id)),
                button('Excluir', 'danger', () => deleteClient(client.id))
            );
            row.appendChild(actions);
            tbody.appendChild(row);
        });
    } catch (error) {
        const row = document.createElement('tr');
        cell(row, error.message).colSpan = 4;
        tbody.appendChild(row);
    }
}

async function editClient(id) {
    try {
        const c = (await request(`/toa-toa-clientes/${encodeURIComponent(id)}`)).dados;
        byId('clienteId').value = c.id;
        ['nome_completo', 'cpf', 'rg', 'whatsapp', 'tipo_contato_1', 'telefone_secundario',
            'tipo_contato_2', 'email', 'cep', 'endereco', 'data_evento', 'preferencias']
            .forEach((field) => { byId(field).value = c[field] ?? ''; });
        clientForm.scrollIntoView({ behavior: 'smooth' });
    } catch (error) { alert(error.message); }
}

async function deleteClient(id) {
    if (!confirm('Deseja realmente excluir este cliente?')) return;
    try {
        const result = await request(`/toa-toa-clientes/${encodeURIComponent(id)}`, { method: 'DELETE' });
        alert(result.mensagem);
        await loadClients();
    } catch (error) { alert(error.message); }
}

clientForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = byId('clienteId').value;
    const data = {};
    ['nome_completo', 'cpf', 'rg', 'whatsapp', 'tipo_contato_1', 'telefone_secundario',
        'tipo_contato_2', 'email', 'cep', 'endereco', 'data_evento', 'preferencias']
        .forEach((field) => { data[field] = byId(field).value || (field === 'data_evento' ? null : ''); });
    try {
        const result = await request(id ? `/toa-toa-clientes/${encodeURIComponent(id)}` : '/toa-toa-clientes', {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        alert(result.mensagem);
        clientForm.reset();
        byId('clienteId').value = '';
        await loadClients();
    } catch (error) { alert(error.message); }
});

function renderSaleItems() {
    const tbody = byId('itensVendaTable').tBodies[0];
    tbody.replaceChildren();
    saleItems.forEach((item, index) => {
        const row = document.createElement('tr');
        cell(row, item.nome);
        cell(row, item.tipo);
        cell(row, `R$ ${item.preco.toFixed(2)}`);
        const actions = document.createElement('td');
        actions.appendChild(button('Remover', 'danger', () => {
            saleItems.splice(index, 1);
            renderSaleItems();
        }));
        row.appendChild(actions);
        tbody.appendChild(row);
    });
}

byId('adicionarItem').addEventListener('click', () => {
    const productId = Number(byId('item_produto_id').value);
    const price = Number(byId('item_preco').value);
    const product = productsCache.find((item) => Number(item.id) === productId);
    if (!product || !Number.isFinite(price) || price < 0) return alert('Selecione um produto e informe um preço válido.');
    saleItems.push({ produto_id: productId, nome: product.nome, tipo: byId('item_tipo').value, preco: price });
    byId('item_preco').value = '';
    renderSaleItems();
});

saleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!saleItems.length) return alert('Adicione ao menos um item à venda.');
    const data = {
        cliente_id: Number(byId('venda_cliente_id').value),
        forma_pagamento: byId('forma_pagamento').value,
        valor_costura: Number(byId('valor_costura').value || 0),
        desconto_valor: Number(byId('desconto_valor').value || 0),
        observacoes: byId('venda_observacoes').value,
        itens: saleItems.map(({ produto_id, tipo, preco }) => ({ produto_id, tipo, preco }))
    };
    try {
        const result = await request('/toa-toa-vendas', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        alert(`${result.mensagem} ID: ${result.venda_id}`);
        saleForm.reset();
        saleItems = [];
        renderSaleItems();
        await loadProducts();
    } catch (error) { alert(error.message); }
});

byId('atualizarProdutos').addEventListener('click', loadProducts);
byId('atualizarClientes').addEventListener('click', loadClients);

async function restoreAccess() {
    try {
        await request('/auth/status');
        apiKeyInput.placeholder = 'Acesso salvo neste navegador';
        await Promise.all([loadProducts(), loadClients()]);
    } catch {
        apiKeyInput.placeholder = 'Digite a senha para acessar';
    }
}

restoreAccess();
