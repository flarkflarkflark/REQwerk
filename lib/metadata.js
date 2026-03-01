(function ( w ) {
	'use strict';

	var textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

	function toUint8Array ( value ) {
		if (!value) return new Uint8Array(0);
		if (value instanceof Uint8Array) return value;
		if (value instanceof ArrayBuffer) return new Uint8Array(value);
		if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
		if (value.buffer instanceof ArrayBuffer) return new Uint8Array(value.buffer);
		return new Uint8Array(value);
	}

	function concatArrays ( chunks ) {
		var total = 0;
		for (var i = 0; i < chunks.length; ++i) total += chunks[i].length;
		var out = new Uint8Array(total);
		var offset = 0;
		for (var j = 0; j < chunks.length; ++j) {
			out.set(chunks[j], offset);
			offset += chunks[j].length;
		}
		return out;
	}

	function bytesFromAscii ( text ) {
		var out = new Uint8Array(text.length);
		for (var i = 0; i < text.length; ++i) out[i] = text.charCodeAt(i) & 0x7F;
		return out;
	}

	function bytesFromUtf8 ( text ) {
		if (!text) return new Uint8Array(0);
		if (textEncoder) return textEncoder.encode(text);

		var utf8 = unescape(encodeURIComponent(text));
		var out = new Uint8Array(utf8.length);
		for (var i = 0; i < utf8.length; ++i) out[i] = utf8.charCodeAt(i);
		return out;
	}

	function bytesFromUtf16LeWithBom ( text ) {
		text = text || '';
		var out = new Uint8Array(2 + text.length * 2);
		out[0] = 0xFF;
		out[1] = 0xFE;
		for (var i = 0; i < text.length; ++i) {
			var code = text.charCodeAt(i);
			out[2 + (i * 2)] = code & 0xFF;
			out[3 + (i * 2)] = (code >> 8) & 0xFF;
		}
		return out;
	}

	function readUInt32LE ( bytes, offset ) {
		return (bytes[offset]) |
			(bytes[offset + 1] << 8) |
			(bytes[offset + 2] << 16) |
			(bytes[offset + 3] << 24);
	}

	function writeUInt32LE ( value ) {
		return new Uint8Array([
			value & 0xFF,
			(value >> 8) & 0xFF,
			(value >> 16) & 0xFF,
			(value >> 24) & 0xFF
		]);
	}

	function writeUInt32BE ( value ) {
		return new Uint8Array([
			(value >> 24) & 0xFF,
			(value >> 16) & 0xFF,
			(value >> 8) & 0xFF,
			value & 0xFF
		]);
	}

	function writeSyncSafeUInt32 ( value ) {
		return new Uint8Array([
			(value >> 21) & 0x7F,
			(value >> 14) & 0x7F,
			(value >> 7) & 0x7F,
			value & 0x7F
		]);
	}

	function normalizeTags ( tags ) {
		tags = tags || {};
		return {
			title: (tags.title || '').trim(),
			artist: (tags.artist || '').trim(),
			album: (tags.album || '').trim(),
			track: (tags.track || '').trim(),
			year: (tags.year || '').trim(),
			genre: (tags.genre || '').trim(),
			comment: (tags.comment || '').trim()
		};
	}

	function hasTags ( tags ) {
		tags = normalizeTags(tags);
		for (var key in tags) {
			if (tags[key]) return true;
		}
		return false;
	}

	function makeId3TextFrame ( id, value ) {
		var payload = concatArrays([
			new Uint8Array([1]),
			bytesFromUtf16LeWithBom(value)
		]);

		return concatArrays([
			bytesFromAscii(id),
			writeUInt32BE(payload.length),
			new Uint8Array([0, 0]),
			payload
		]);
	}

	function makeId3CommentFrame ( value ) {
		var payload = concatArrays([
			new Uint8Array([1, 0x65, 0x6E, 0x67]),
			bytesFromUtf16LeWithBom(''),
			new Uint8Array([0, 0]),
			bytesFromUtf16LeWithBom(value)
		]);

		return concatArrays([
			bytesFromAscii('COMM'),
			writeUInt32BE(payload.length),
			new Uint8Array([0, 0]),
			payload
		]);
	}

	function buildId3Tag ( tags ) {
		tags = normalizeTags(tags);
		var frames = [];

		if (tags.title) frames.push(makeId3TextFrame('TIT2', tags.title));
		if (tags.artist) frames.push(makeId3TextFrame('TPE1', tags.artist));
		if (tags.album) frames.push(makeId3TextFrame('TALB', tags.album));
		if (tags.track) frames.push(makeId3TextFrame('TRCK', tags.track));
		if (tags.year) frames.push(makeId3TextFrame('TYER', tags.year));
		if (tags.genre) frames.push(makeId3TextFrame('TCON', tags.genre));
		if (tags.comment) frames.push(makeId3CommentFrame(tags.comment));
		frames.push(makeId3TextFrame('TENC', 'RECwerk'));

		var body = concatArrays(frames);
		return concatArrays([
			bytesFromAscii('ID3'),
			new Uint8Array([3, 0, 0]),
			writeSyncSafeUInt32(body.length),
			body
		]);
	}

	function stripId3Tag ( bytes ) {
		if (bytes.length < 10) return bytes;
		if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return bytes;

		var size = ((bytes[6] & 0x7F) << 21) |
			((bytes[7] & 0x7F) << 14) |
			((bytes[8] & 0x7F) << 7) |
			(bytes[9] & 0x7F);

		return bytes.slice(10 + size);
	}

	function applyMp3Tags ( bytes, tags ) {
		var clean = stripId3Tag(toUint8Array(bytes));
		if (!hasTags(tags)) return clean;
		return concatArrays([buildId3Tag(tags), clean]);
	}

	function buildWavInfoChunk ( tags ) {
		tags = normalizeTags(tags);
		var entries = [
			['INAM', tags.title],
			['IART', tags.artist],
			['IPRD', tags.album],
			['ITRK', tags.track],
			['ICRD', tags.year],
			['IGNR', tags.genre],
			['ICMT', tags.comment],
			['ISFT', 'RECwerk']
		];
		var chunks = [bytesFromAscii('INFO')];

		for (var i = 0; i < entries.length; ++i) {
			if (!entries[i][1]) continue;
			var text = bytesFromUtf8(entries[i][1]);
			var payloadLength = text.length + 1;
			var paddedLength = payloadLength + (payloadLength % 2);
			var payload = new Uint8Array(paddedLength);
			payload.set(text, 0);

			chunks.push(bytesFromAscii(entries[i][0]));
			chunks.push(writeUInt32LE(payloadLength));
			chunks.push(payload);
		}

		var body = concatArrays(chunks);
		if (body.length === 4) return null;

		return concatArrays([
			bytesFromAscii('LIST'),
			writeUInt32LE(body.length),
			body,
			new Uint8Array(body.length % 2 ? [0] : [])
		]);
	}

	function applyWavTags ( bytes, tags ) {
		bytes = toUint8Array(bytes);
		if (bytes.length < 12) return bytes;
		if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'RIFF') return bytes;
		if (String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) !== 'WAVE') return bytes;

		var infoChunk = buildWavInfoChunk(tags);
		var chunks = [];
		var offset = 12;
		var end = Math.min(bytes.length, readUInt32LE(bytes, 4) + 8);

		while (offset + 8 <= end) {
			var id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
			var size = readUInt32LE(bytes, offset + 4);
			var total = 8 + size + (size % 2);
			if (total <= 0 || offset + total > bytes.length) break;

			if (!(id === 'LIST' && size >= 4 &&
				String.fromCharCode(bytes[offset + 8], bytes[offset + 9], bytes[offset + 10], bytes[offset + 11]) === 'INFO')) {
				chunks.push(bytes.slice(offset, offset + total));
			}

			offset += total;
		}

		if (infoChunk) chunks.push(infoChunk);

		var body = concatArrays([bytesFromAscii('WAVE')].concat(chunks));
		return concatArrays([
			bytesFromAscii('RIFF'),
			writeUInt32LE(body.length),
			body
		]);
	}

	function writeUInt24BE ( value ) {
		return new Uint8Array([
			(value >> 16) & 0xFF,
			(value >> 8) & 0xFF,
			value & 0xFF
		]);
	}

	function buildFlacVorbisCommentBlock ( tags ) {
		tags = normalizeTags(tags);
		var comments = [];
		var map = {
			title: 'TITLE',
			artist: 'ARTIST',
			album: 'ALBUM',
			track: 'TRACKNUMBER',
			year: 'DATE',
			genre: 'GENRE',
			comment: 'DESCRIPTION'
		};

		for (var key in map) {
			if (tags[key]) comments.push(map[key] + '=' + tags[key]);
		}

		comments.push('ENCODER=RECwerk');

		if (!comments.length) return null;

		var vendor = bytesFromUtf8('RECwerk');
		var parts = [writeUInt32LE(vendor.length), vendor, writeUInt32LE(comments.length)];

		for (var i = 0; i < comments.length; ++i) {
			var comment = bytesFromUtf8(comments[i]);
			parts.push(writeUInt32LE(comment.length));
			parts.push(comment);
		}

		return concatArrays(parts);
	}

	function applyFlacTags ( bytes, tags ) {
		bytes = toUint8Array(bytes);
		if (bytes.length < 4) return bytes;
		if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'fLaC') return bytes;

		var blocks = [];
		var offset = 4;
		var isLast = false;

		while (!isLast && offset + 4 <= bytes.length) {
			var header = bytes[offset];
			isLast = !!(header & 0x80);
			var type = header & 0x7F;
			var length = (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
			var nextOffset = offset + 4 + length;
			if (nextOffset > bytes.length) return bytes;

			blocks.push({
				type: type,
				data: bytes.slice(offset + 4, nextOffset)
			});
			offset = nextOffset;
		}

		var audioData = bytes.slice(offset);
		var filtered = [];
		for (var i = 0; i < blocks.length; ++i) {
			if (blocks[i].type !== 4) filtered.push(blocks[i]);
		}

		var commentData = buildFlacVorbisCommentBlock(tags);
		if (commentData) {
			var insertAt = filtered.length > 0 ? 1 : 0;
			filtered.splice(insertAt, 0, { type: 4, data: commentData });
		}

		var encodedBlocks = [];
		for (var j = 0; j < filtered.length; ++j) {
			var block = filtered[j];
			var blockHeader = new Uint8Array(4);
			blockHeader[0] = block.type | (j === filtered.length - 1 ? 0x80 : 0);
			blockHeader.set(writeUInt24BE(block.data.length), 1);
			encodedBlocks.push(blockHeader);
			encodedBlocks.push(block.data);
		}

		return concatArrays([
			bytesFromAscii('fLaC'),
			concatArrays(encodedBlocks),
			audioData
		]);
	}

	function guessFormat ( value ) {
		var text = (value || '').toLowerCase();
		if (text.indexOf('.mp3') > -1 || text === 'mp3') return 'mp3';
		if (text.indexOf('.wav') > -1 || text === 'wav') return 'wav';
		if (text.indexOf('.flac') > -1 || text === 'flac') return 'flac';
		return '';
	}

	function applyMetadataToBytes ( bytes, format, tags ) {
		format = guessFormat(format);
		if (!hasTags(tags)) return toUint8Array(bytes);

		if (format === 'mp3') return applyMp3Tags(bytes, tags);
		if (format === 'wav') return applyWavTags(bytes, tags);
		if (format === 'flac') return applyFlacTags(bytes, tags);
		return toUint8Array(bytes);
	}

	function applyMetadataToBlob ( blob, format, tags ) {
		return blob.arrayBuffer().then(function (buffer) {
			var bytes = applyMetadataToBytes(buffer, format, tags);
			return new Blob([bytes], { type: blob.type || 'application/octet-stream' });
		});
	}

	w.PKMetadataWriter = {
		normalizeTags: normalizeTags,
		hasTags: hasTags,
		guessFormat: guessFormat,
		applyMetadataToBytes: applyMetadataToBytes,
		applyMetadataToBlob: applyMetadataToBlob
	};

})( window );
