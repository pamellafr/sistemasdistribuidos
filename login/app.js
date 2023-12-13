const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose(); // Importa o SQLite
const amqp = require('amqplib');


const app = express();
app.use(bodyParser.json());

// Cria uma conexão com o banco de dados (ou cria o arquivo do banco se não existir)
const db = new sqlite3.Database('usuarios.db', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite');
        // Cria uma tabela 'usuarios' se não existir
        db.run(`CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT,
            email TEXT UNIQUE,  -- Garante que o campo email seja único na tabela
            senha TEXT
        )`);
    }
});

// Consumidor
async function consumirCadastro() {
    try {
        const connection = await amqp.connect({
            host: 'localhost', // Nome do serviço RabbitMQ definido no docker-compose.yml
            port: 5673,        // Porta padrão do RabbitMQ
            username: 'guest',
            password: 'guest'
        });
        const channel = await connection.createChannel();
        const queueName = 'cadastro';

        // Declare a fila
        await channel.assertQueue(queueName);

        // Consume mensagens da fila
        await channel.consume(queueName, (msg) => {
            if (msg !== null) {
                const dadosCadastro = JSON.parse(msg.content.toString());
                console.log('Recebido dados de cadastro:', dadosCadastro);
                // Insira os dados no banco de dados
                db.run(`INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)`,
                    [dadosCadastro.nome, dadosCadastro.email, dadosCadastro.senha],
                    function (err) {
                        if (err) {
                            console.error('Erro ao inserir dados de cadastro no banco de dados:', err);
                        } else {
                            console.log('Dados de cadastro inseridos no banco de dados com sucesso.');
                        }
                    });

                channel.ack(msg); // Confirma que a mensagem foi processada com sucesso
                console.log('Consumidor iniciado. Aguardando mensagens da fila...');
            }
        });
    } catch (error) {
        console.error('Erro ao consumir cadastro:', error);
    }
}

consumirCadastro();

app.post('/login', (req, res) => {
    const { email, senha } = req.body;

    console.log(`Tentativa de login para o Email: ${email}, Senha: ${senha}`);

    // Verifica se as credenciais estão corretas
    db.get(`SELECT * FROM usuarios WHERE email = ? AND senha = ?`, [email, senha], (err, row) => {
        console.log('Resultado da consulta para verificar e-mail existente:', row);

        if (err) {
            return res.status(500).json({ message: 'Erro ao verificar credenciais no banco de dados' });
        }
        if (!row) {
            console.log('Credenciais inválidas. Usuário não encontrado.');
            return res.json({ success: false, message: 'Credenciais inválidas. Por favor, tente novamente.' });
        }

        // Se as credenciais estiverem corretas, retorna sucesso
        console.log('Login bem-sucedido!');
        res.json({ success: true });

        // Após a verificação bem-sucedida do login, envia o nome para a fila
        enviarLogin(row.email); // Enviar o email em vez do nome
    });
});

async function enviarLogin(email) {
    try {
        const connection = await amqp.connect({
            host: 'localhost',
            port: 5673,
            username: 'guest',
            password: 'guest'
        });
        const channel = await connection.createChannel();
        const queueName = 'login';
        const mensagem = { email }; // Enviar o email em vez do nome

        await channel.assertQueue(queueName);
        await channel.sendToQueue(queueName, Buffer.from(JSON.stringify(mensagem)));

        console.log("Login enviado para a fila 'login'");

        await channel.close();
        await connection.close();
    } catch (error) {
        console.error('Erro ao enviar login:', error);
    }
}

app.post('/cadastro', (req, res) => {
    const { nome, email, senha } = req.body;

    // Verifica se o email já está cadastrado
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], (err, row) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao verificar email no banco de dados' });
        }
        if (row) {
            console.log(`O Email: ${email}, já existe`);
            return res.status(400).json({ message: 'Email já cadastrado. Por favor, use outro email.' });
        }

        // Insere os dados do usuário na tabela 'usuarios'
        db.run(`INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)`, [nome, email, senha], function (err) {
            if (err) {
                return res.status(500).json({ message: 'Erro ao cadastrar usuário no banco de dados' });
            }
            res.json({ message: 'Usuário cadastrado com sucesso!' });
            console.log(`Nome: ${nome}, Email: ${email}, Senha: ${senha}`);
        });
    });
});

app.use(express.static(__dirname));

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
