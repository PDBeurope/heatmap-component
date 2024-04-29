import { sortDirection } from './utils';


describe('sortDirection', () => {
    it('sortDirection', () => {
        expect(sortDirection([])).toEqual('none');
        expect(sortDirection([1])).toEqual('none');
        expect(sortDirection([1, 1])).toEqual('none');
        expect(sortDirection([1, 2])).toEqual('asc');
        expect(sortDirection([1, 0])).toEqual('desc');
        expect(sortDirection([1, 1, 2])).toEqual('none');
        expect(sortDirection([1, 1, 0])).toEqual('none');
        expect(sortDirection([1, 2, 3])).toEqual('asc');
        expect(sortDirection([1, 5, 9, 45, 120])).toEqual('asc');
        expect(sortDirection([1, 2, 3, 5, 4, 6, 7])).toEqual('none');
        expect(sortDirection([7, 6, 5, 4, 3, 2, 1])).toEqual('desc');
    });
});
