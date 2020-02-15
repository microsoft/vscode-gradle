package com.github.badsyntax.gradletasks;

import javax.inject.Singleton;
import dagger.BindsInstance;
import dagger.Component;

@Singleton
@Component(modules = ApplicationModule.class)
public interface ApplicationFactory {
  Application get();

  void inject(Application application);

  @Component.Builder
  interface Builder {
    @BindsInstance
    Builder withPort(int port);
    ApplicationFactory build();
  }
}
