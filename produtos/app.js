const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const amqp = require('amqplib');

const app = express();
app.use(bodyParser.json());

const db = new sqlite3.Database('produtos.db', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite');
        db.run(`CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nomeproduto TEXT,
            tipo TEXT UNIQUE,
            valor TEXT
        )`);
    }
});

async function enviarProdutoParaFila(nomeproduto, tipo, valor) {
    try {
        const connection = await amqp.connect({
            host: 'localhost',
            port: 5673,
            username: 'guest',
            password: 'guest'
        });
        const channel = await connection.createChannel();
        const queueName = 'produto';
        const mensagem = { nomeproduto, tipo, valor };

        await channel.assertQueue(queueName);
        await channel.sendToQueue(queueName, Buffer.from(JSON.stringify(mensagem)));

        console.log("Produto enviado para a fila 'produto'");

        await channel.close();
        await connection.close();
    } catch (error) {
        console.error('Erro ao enviar produto:', error);
    }
}

async function enviarLoginParaFila(email, senha) {
    try {
        const connection = await amqp.connect({
            host: 'localhost',
            port: 5673,
            username: 'guest',
            password: 'guest'
        });
        const channel = await connection.createChannel();
        const queueName = 'login';
        const mensagem = { email, senha };

        await channel.assertQueue(queueName);
        await channel.sendToQueue(queueName, Buffer.from(JSON.stringify(mensagem)));

        console.log("Dados de login enviados para a fila 'login'");

        await channel.close();
        await connection.close();
    } catch (error) {
        console.error('Erro ao enviar dados de login:', error);
    }
}

async function consumirLogin() {
    try {
        const connection = await amqp.connect({
            host: 'localhost',
            port: 5673,
            username: 'guest',
            password: 'guest'
        });
        const channel = await connection.createChannel();
        const queueName = 'login';

        await channel.assertQueue(queueName);

        await channel.consume(queueName, (msg) => {
            if (msg !== null) {
                const dadosLogin = JSON.parse(msg.content.toString());
                console.log('Recebido dados de login:', dadosLogin);
                channel.ack(msg); // Confirma que a mensagem foi processada com sucesso
                console.log('Consumidor de login iniciado. Aguardando mensagens da fila...');
            }
        });
    } catch (error) {
        console.error('Erro ao consumir dados de login:', error);
    }
}

consumirLogin();


app.post('/produto', (req, res) => {
    const { nomeproduto, tipo, valor } = req.body;
    console.log(`Nome Produto: ${nomeproduto}, Tipo: ${tipo}, Valor: ${valor}`);

    db.get(`SELECT * FROM produtos WHERE tipo = ?`, [tipo], (err, row) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao verificar produto no banco de dados' });
        }
        if (row) {
            console.log(`O produto: ${tipo}, já existe`);
            return res.status(400).json({ message: 'Produto já cadastrado. Por favor, use outro produto.' });
        }

        db.run(`INSERT INTO produtos (nomeproduto, tipo, valor) VALUES (?, ?, ?)`, [nomeproduto, tipo, valor], (err) => {
            if (err) {
                return res.status(500).json({ message: 'Erro ao cadastrar produto no banco de dados' });
            }

            enviarProdutoParaFila(nomeproduto, tipo, valor);

            console.log(`Produto cadastrado com sucesso: Nome Produto: ${nomeproduto}, Tipo: ${tipo}, Valor: ${valor}`);

            res.json({ message: 'Cadastro de produto realizado com sucesso' });
        });
    });
});

app.post('/login', (req, res) => {
    const { email, senha } = req.body;
    console.log(`Tentativa de login para o Email: ${email}, Senha: ${senha}`);

    // Lógica de verificação de login...

    enviarLoginParaFila(email, senha);

    console.log(`Dados de login enviados para a fila 'login'`);

    res.json({ message: 'Tentativa de login realizada com sucesso' });
});

const path = require('path');

app.use(express.static(__dirname));

const PORT = 3002;
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
