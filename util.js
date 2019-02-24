const truncateTimestampForMySQL = timestamp => timestamp.replace('T', ' ').replace('Z', '');

module.exports = {
	truncateTimestampForMySQL
};
