import { Domain } from './domain';


describe('Domain', () => {
    it('domain.index', () => {
        const domain = Domain.create(['A', 'B', 'X', 'C']);
        expect(domain.index.get('A')).toEqual(0);
        expect(domain.index.get('B')).toEqual(1);
        expect(domain.index.get('X')).toEqual(2);
        expect(domain.index.get('C')).toEqual(3);
    });
});
