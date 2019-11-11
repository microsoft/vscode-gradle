import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';

import { parseGradleTasks } from '../../tasks';
describe('tasks', () => {
  describe('gradle tasks output parsing', () => {
    it('should correctly parse tasks', async () => {
      const stdout = fs.readFileSync(
        path.resolve(
          __dirname,
          '../../../test-fixtures/unit/gradle-tasks-stdout'
        ),
        'utf8'
      );
      const tasks = parseGradleTasks(stdout);

      assert.equal(Object.keys(tasks).length, 8);
      assert.equal('help' in tasks, true);
      assert.equal('run' in tasks, true);
      assert.equal('runShadow' in tasks, true);
      assert.equal('startShadowScripts' in tasks, true);

      assert.equal('sub-project:help' in tasks, true);
      assert.equal('sub-project:run' in tasks, true);
      assert.equal('sub-project:runShadow' in tasks, true);
      assert.equal('sub-project:startShadowScripts' in tasks, true);

      assert.equal(tasks.help, undefined);
      assert.equal(tasks.run, 'Runs a task');
      assert.equal(tasks.runShadow, 'Runs a shadow task');
      assert.equal(tasks.startShadowScripts, 'Starts a shadow script');

      assert.equal(tasks['sub-project:help'], undefined);
      assert.equal(tasks['sub-project:run'], 'Runs a task');
      assert.equal(tasks['sub-project:runShadow'], 'Runs a shadow task');
      assert.equal(
        tasks['sub-project:startShadowScripts'],
        'Starts a shadow script'
      );
    });
  });
});
