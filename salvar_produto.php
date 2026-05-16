<?php
// d:\TOA_TOA_API\salvar_produto.php

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // No Render, substitua pela URL do seu Web Service Node.js
    $baseUrl = "https://api-toa-a-toa-2.onrender.com/toa-toa-api-supabase";
    $id = $_POST['id'] ?? null;
    
    // Se tiver ID, a URL muda para incluir o ID e o método será PUT
    $url = $id ? "$baseUrl/$id" : $baseUrl;
    $metodo = $id ? 'PUT' : 'POST';

    // É recomendável usar variáveis de ambiente no PHP também
    $apiKey = getenv('CHAVE_MESTRA') ?: "sua_chave_de_comunicacao_php_node";

    // 1. Mapeia os dados do formulário para o formato que o seu db.js espera
    $dadosProduto = [
        "codProduto"    => $_POST['codProduto'] ?? '',
        "nomeProduto"   => $_POST['nomeProduto'] ?? '',
        "categoria"     => $_POST['categoria'] ?? '',
        "validade"      => $_POST['validade'] ?? null,
        "quantidade"    => (int)($_POST['quantidade'] ?? 0),
        "precoUnitario" => (float)($_POST['precoUnitario'] ?? 0),
        "precoPacote"   => (float)($_POST['precoPacote'] ?? 0),
        "descricao"     => $_POST['descricao'] ?? ''
    ];

    // 2. Adiciona o arquivo real se ele existir
    if (isset($_FILES['imagemProduto']) && $_FILES['imagemProduto']['error'] === UPLOAD_ERR_OK) {
        $dadosProduto['imagem'] = new CURLFile($_FILES['imagemProduto']['tmp_name'], $_FILES['imagemProduto']['type'], $_FILES['imagemProduto']['name']);
    }

    // 3. Envia via cURL para o Node.js
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    if ($id) {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "PUT");
    } else {
        curl_setopt($ch, CURLOPT_POST, true);
    }

    curl_setopt($ch, CURLOPT_POSTFIELDS, $dadosProduto); // Envia como multipart/form-data
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "x-api-key: $apiKey"
        // Content-Type é definido automaticamente pelo cURL ao enviar o array
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    // 4. Verifica o resultado
    if ($err) {
        echo "Erro de conexão: " . $err;
    } else {
        $res = json_decode($response, true);
        if ($httpCode === 200 && ($res['status'] ?? '') === 'sucesso') {
            // Redireciona de volta com sucesso
            header("Location: index.php?sucesso=1");
            exit;
        } else {
            echo "Erro na API: " . ($res['mensagem'] ?? 'Erro desconhecido');
            echo "<br>Detalhes: " . ($res['detalhe'] ?? '');
        }
    }
} else {
    header("Location: index.php");
}
?>