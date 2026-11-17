// Where each number sits on a 3D-model die. Dice So Nice dice sets (The
// Rollsmith's, for one) ship glTF models with their numbers painted on, built
// around one shared layout per die: these corner positions, and which value is
// on which face. We roll the model on a physics body of the same shape, then
// turn the model so the rolled value is the one facing up.
//
// Faces list corner indices; `values[i]` is the number on face i. The layout is
// the interoperability data model dice are made against, written out here.

export interface ModelLayout {
	vertices: [number, number, number][];
	faces: number[][];
	values: number[];
	/** d4: the result is read from the face resting on the table, not the top. */
	readsDown?: boolean;
}

const PHI = 1.618033988749895;
const IPHI = 0.6180339887498948;

export const MODEL_LAYOUTS: Record<number, ModelLayout> = {
	4: {
		vertices: [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]],
		faces: [[1, 0, 2], [0, 1, 3], [0, 3, 2], [1, 2, 3]],
		values: [2, 4, 3, 1],
		readsDown: true,
	},
	6: {
		vertices: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
		faces: [[0, 3, 2, 1], [1, 2, 6, 5], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [4, 5, 6, 7]],
		values: [3, 5, 1, 6, 2, 4],
	},
	8: {
		vertices: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
		faces: [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 3, 4], [1, 4, 2], [1, 2, 5], [1, 5, 3]],
		values: [5, 3, 1, 7, 2, 8, 6, 4],
	},
	10: {
		vertices: [
			[1, 0, -0.105], [0.8090169943749475, 0.5877852522924731, 0.105], [0.30901699437494745, 0.9510565162951535, -0.105],
			[-0.30901699437494734, 0.9510565162951536, 0.105], [-0.8090169943749473, 0.5877852522924732, -0.105], [-1, 0, 0.105],
			[-0.8090169943749476, -0.587785252292473, -0.105], [-0.30901699437494756, -0.9510565162951535, 0.105],
			[0.30901699437494723, -0.9510565162951536, -0.105], [0.8090169943749473, -0.5877852522924734, 0.105], [0, 0, -1], [0, 0, 1],
		],
		faces: [[5, 6, 7, 11], [4, 3, 2, 10], [1, 2, 3, 11], [0, 9, 8, 10], [7, 8, 9, 11], [8, 7, 6, 10], [9, 0, 1, 11], [2, 1, 0, 10], [3, 4, 5, 11], [6, 5, 4, 10]],
		values: [1, 2, 5, 10, 7, 4, 3, 8, 9, 6],
	},
	12: {
		vertices: [
			[0, IPHI, PHI], [0, IPHI, -PHI], [0, -IPHI, PHI], [0, -IPHI, -PHI], [PHI, 0, IPHI], [PHI, 0, -IPHI], [-PHI, 0, IPHI], [-PHI, 0, -IPHI],
			[IPHI, PHI, 0], [IPHI, -PHI, 0], [-IPHI, PHI, 0], [-IPHI, -PHI, 0], [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
		],
		faces: [
			[2, 14, 4, 12, 0], [15, 9, 11, 19, 3], [16, 10, 17, 7, 6], [6, 7, 19, 11, 18], [6, 18, 2, 0, 16], [18, 11, 9, 14, 2],
			[1, 17, 10, 8, 13], [1, 13, 5, 15, 3], [13, 8, 12, 4, 5], [5, 4, 14, 9, 15], [0, 12, 8, 10, 16], [3, 19, 7, 17, 1],
		],
		values: [7, 5, 3, 11, 12, 9, 4, 1, 2, 10, 8, 6],
	},
	20: {
		vertices: [
			[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
			[PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
		],
		faces: [
			[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
			[3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
		],
		values: [10, 17, 3, 16, 8, 7, 12, 20, 6, 19, 5, 18, 4, 11, 13, 15, 2, 14, 9, 1],
	},
};
