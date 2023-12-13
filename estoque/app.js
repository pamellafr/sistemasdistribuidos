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

async function consumirProduto() {
    try {
        const connection = await amqp.connect({
            host: 'localhost',
            port: 5673,
            username: 'guest',
            password: 'guest'
        });
        const channel = await connection.createChannel();
        const queueName = 'produto';

        await channel.assertQueue(queueName);

        await channel.consume(queueName, (msg) => {
            if (msg !== null) {
                const dadosProduto = JSON.parse(msg.content.toString());
                console.log('Recebido dados de produto:', dadosProduto);

                // Lógica para atualizar o estoque aqui
                atualizarEstoque(dadosProduto);

                channel.ack(msg); // Confirma que a mensagem foi processada com sucesso
                console.log('Consumidor de produto iniciado. Aguardando mensagens da fila...');
            }
        });
    } catch (error) {
        console.error('Erro ao consumir dados de produto:', error);
    }
}

consumirProduto();

async function enviarProdutoParaFila(nomeproduto, tipo, valor, estoque) {
    try {
        const connection = await amqp.connect({
            host: 'localhost',
            port: 5673,
            username: 'guest',
            password: 'guest'
        });
        const channel = await connection.createChannel();
        const queueName = 'produto';
        const mensagem = { nomeproduto, tipo, valor, estoque };

        await channel.assertQueue(queueName);
        await channel.sendToQueue(queueName, Buffer.from(JSON.stringify(mensagem)));

        console.log("Produto enviado para a fila 'produto'");

        await channel.close();
        await connection.close();
    } catch (error) {
        console.error('Erro ao enviar produto:', error);
    }
}

function atualizarEstoque(dadosProduto) {
    db.get(`SELECT COUNT(*) as count FROM estoque WHERE tipo = ?`, [dadosProduto.tipo], (err, result) => {
        if (err) {
            console.error('Erro ao verificar produto no estoque:', err);
            return;
        }

        const produtoExiste = result.count > 0;

        if (produtoExiste) {
            // Se o produto já existe no estoque, atualiza a quantidade
            db.run(`UPDATE estoque SET quantidade = ? WHERE tipo = ?`, [dadosProduto.estoque, dadosProduto.tipo], (err) => {
                if (err) {
                    console.error('Erro ao atualizar quantidade no estoque:', err);
                }
            });
        } else {
            // Se o produto não existe no estoque, insere um novo registro
            db.run(`INSERT INTO estoque (nomeproduto, tipo, quantidade) VALUES (?, ?, ?)`, [dadosProduto.nomeproduto, dadosProduto.tipo, dadosProduto.estoque], (err) => {
                if (err) {
                    console.error('Erro ao cadastrar produto no estoque:', err);
                }
            });
        }
    });
}

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

app.use(express.static(__dirname));

const PORT = 3003;
app.listen(PORT, () => {
    console.log(`Servidor de estoque rodando em http://localhost:${PORT}`);
});
