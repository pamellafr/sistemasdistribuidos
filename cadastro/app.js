const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose(); // Importa o SQLite

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

//produtor

const amqp = require('amqplib');

async function enviarCadastro(nome, email, senha) {
  try {
    const connection = await amqp.connect({
        host: 'localhost',
        port: 5673,
        username: 'guest',
        password: 'guest'
    });
    const channel = await connection.createChannel();
    const queueName = 'cadastro';
    const mensagem = { nome: nome, email: email, senha: senha };

    await channel.assertQueue(queueName);
    await channel.sendToQueue(queueName, Buffer.from(JSON.stringify(mensagem)));
    
    console.log("Cadastro enviado para a fila 'cadastro'");
    
    await channel.close();
    await connection.close();
  } catch (error) {
    console.error('Erro ao enviar cadastro:', error);
  }
}


app.post('/cadastro', (req, res) => {
    const { nome, email, senha } = req.body;
    console.log(`Nome: ${nome}, Email: ${email}, Senha: ${senha}`);
    
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], (err, row) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao verificar email no banco de dados' });
        }
        if (row) {
            console.log(`O Email: ${email}, já existe`);
            return res.status(400).json({ message: 'Email já cadastrado. Por favor, use outro email.' });
        }

        // Insere os dados do usuário na tabela 'usuarios'
        db.run(`INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)`, [nome, email, senha], function(err) {
            if (err) {
                return res.status(500).json({ message: 'Erro ao cadastrar usuário no banco de dados' });
            }

            enviarCadastro(nome, email, senha);
           
            console.log(`Nome: ${nome}, Email: ${email}, Senha: ${senha}`);
            
            // Agora, após o cadastro ser realizado com sucesso, você pode enviar uma resposta 200 OK
            res.json({ message: 'Cadastro realizado com sucesso' });
        });
    });
});


app.use(express.static(__dirname));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
