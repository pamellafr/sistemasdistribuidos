const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const amqp = require('amqplib');
const path = require('path');


const app = express();
app.use(bodyParser.json());

const db = new sqlite3.Database('estoque.db', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite para Estoque');
        db.run(`CREATE TABLE IF NOT EXISTS estoque (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nomeproduto TEXT,
            tipo TEXT UNIQUE,
            quantidade INTEGER
        )`);
    }
});

async function consumirEstoque() {
    try {
        const connection = await amqp.connect({
            host: 'localhost',
            port: 5673,
            username: 'guest',
            password: 'guest'
        });

        const channel = await connection.createChannel();
        const filaProduto = 'produto';
        const filaEstoque = 'estoque';

        // Declare as filas
        await channel.assertQueue(filaProduto);
        await channel.assertQueue(filaEstoque);

        // Consume mensagens da fila 'produto'
        await channel.consume(filaProduto, (msg) => {
            if (msg !== null) {
                const dadosProduto = JSON.parse(msg.content.toString());
                console.log('Recebido dados de produto:', dadosProduto);

                // Simulação: Verifica se o produto está no estoque
                const produtoNoEstoque = verificarProdutoNoEstoque(dadosProduto);

                // Se o produto estiver no estoque, realiza as operações necessárias
                if (produtoNoEstoque) {
                    console.log('Produto está no estoque. Realizando operações no estoque...');

                    // Atualiza a tabela de estoque
                    atualizarEstoque(dadosProduto);

                    // Após processar a mensagem, envia para a fila 'estoque'
                    channel.sendToQueue(filaEstoque, Buffer.from(JSON.stringify({ produto: dadosProduto })));
                } else {
                    console.log('Produto não está no estoque. Ignorando operações no estoque.');
                }

                channel.ack(msg); // Confirma que a mensagem foi processada com sucesso
                console.log('Consumidor de estoque: Aguardando mensagens da fila...');
            }
        });
    } catch (error) {
        console.error('Erro ao consumir estoque:', error);
    }
}

function verificarProdutoNoEstoque(dadosProduto) {
    // Lógica de verificação do produto no estoque (simulação)
    // Aqui você implementa a lógica real para verificar se o produto está no estoque
    // Retorna true se o produto estiver no estoque, false caso contrário
    return Math.random() < 0.8; // Simulação: 80% de chance do produto estar no estoque
}

function atualizarEstoque(dadosProduto) {
    // Atualiza a tabela de estoque com as informações do produto
    db.get(`SELECT * FROM estoque WHERE tipo = ?`, [dadosProduto.tipo], (err, row) => {
        if (err) {
            console.error('Erro ao verificar produto no estoque:', err);
            return;
        }

        if (row) {
            // Se o produto já existe no estoque, atualiza a quantidade
            db.run(`UPDATE estoque SET quantidade = quantidade + 1 WHERE tipo = ?`, [dadosProduto.tipo], (err) => {
                if (err) {
                    console.error('Erro ao atualizar quantidade no estoque:', err);
                }
            });
        } else {
            // Se o produto não existe no estoque, insere um novo registro
            db.run(`INSERT INTO estoque (nomeproduto, tipo, quantidade) VALUES (?, ?, 1)`, [dadosProduto.nomeproduto, dadosProduto.tipo], (err) => {
                if (err) {
                    console.error('Erro ao cadastrar produto no estoque:', err);
                }
            });
        }
    });
}

// Inicia o consumidor de estoque
consumirEstoque();

// Rota para exibir o estoque
app.get('/estoque', (req, res) => {
    db.all('SELECT * FROM estoque', (err, rows) => {
        if (err) {
            console.error('Erro ao buscar dados do estoque:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
        } else {
            res.json(rows);
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = 3003;
app.listen(PORT, () => {
    console.log(`Servidor de estoque rodando em http://localhost:${PORT}`);
});

