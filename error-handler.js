module.exports = (error, _req, res, next) => {
	if (error) {
		console.error(error);
		res.status(error.status || 500).send({
			msg: error.msg,
			status: error.status,
			error
		});
	}

	next();
};
