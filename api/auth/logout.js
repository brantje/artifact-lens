const { cookie } = require('../_lib');
module.exports = (req,res) => { res.setHeader('Set-Cookie', cookie('gh_session','',{maxAge:0})); res.redirect(302,'/'); };
