// importar o mongoose (framework para nos ajudar a trabalhar com o mongodb)
// para poder acessar a sua funcao de conexao com o banco de dados.
const mongoose = require('mongoose');

const Conn = (url, user, pass, data) => {
  // criar uma conexao com o banco de dados.
  // url de conexao = mongodb://servidor:porta/nomedobanco
  // useNewUrlParser = fala pro mongo usar o novo sistema de urls
  // useUnifiedTopology = mecanismo de monitoramento do banco de dados
  mongoose.connect(`${url}/${data}`,{
      user: user,
      pass: pass,
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  ).then(() => {
    console.log('Conexao com o MongoDB executada com sucesso');
  }).catch((err) => {
    console.error(err);
  })
}

module.exports = Conn;